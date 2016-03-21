var rubicsApp = angular.module("rubicsApp", [
  'colorpicker.module',
  'rubicsApp.config'
]);

rubicsApp.factory('storageService', [function() {
  var itemPrefix = 'rubicsApp.dashboard.';
  return {
    items: function() {
      if (!window.localStorage) {
        return [];
      }
      var keys = [];
      for (var i=0; i < window.localStorage.length; i++) {
        keys.push(window.localStorage.key(i));
      }
      return keys.filter(function(n) { return n.substr(0, itemPrefix.length) === itemPrefix; }).map(function(n) { return n.substr(itemPrefix.length); }).sort();
    },

    load: function(name) {
      var json = localStorage.getItem(itemPrefix + name);
      if (json) {
        return angular.fromJson(json);
      }
      return json;
    },

    save: function(name, value) {
      if (!window.localStorage) {
        return;
      }
      localStorage.setItem(itemPrefix + name, angular.toJson(value));
    }

  };
}]);  //storageService


rubicsApp.factory('remoteStorageService', ['$q', '$http', 'RUBICS', function($q, $http, RUBICS) {
  var index = 'rubicsapp';
  var items = null;

  function _refresh() {
    items = null;
  }

  return {
    items: function() {
      var deferred = $q.defer();
      if (items) {
        deferred.resolve(items);
        return deferred.promise;
      }
      $http.post(RUBICS.ELASTICSEARCH_URL + index + '/dashboard/_search', angular.fromJson({"query":{"query_string":{"query":"title:*"}},"size":100})).
        success(function(data, status, headers, config) {
          if (data && data.hits && data.hits.hits) {
            items = data.hits.hits.map(function(h) { return h._id; }).sort();
            deferred.resolve(items);
          }
        }).
        error(function() {
          deferred.reject();
        });
      return deferred.promise;
    },

    load: function(name) {
      var deferred = $q.defer();
      $http.get(RUBICS.ELASTICSEARCH_URL + index + '/dashboard/' + name).
        success(function(json, status, headers, config) {
          //console.log('loaded data: ' + angular.toJson(angular.fromJson(data)._source.data));
          var data = angular.fromJson(json);
          if (data && data._source && data._source.data) {
            deferred.resolve(data._source.data);
          }
        }).
        error(function() {
          deferred.reject(null);
        });
      return deferred.promise;
    },

    save: function(name, value) {
      var deferred = $q.defer();
      $http.put(RUBICS.ELASTICSEARCH_URL + index + '/dashboard/' + name, angular.toJson({ title: name, data: value })).
        success(function(data, status, headers, config) {
          deferred.resolve(name);
          _refresh();
        }).
        error(function() {
          deferred.reject();
        });
      return deferred.promise;
    }
  };
}]);  //remoteStorageService


rubicsApp.factory('cubismService', ['$q', 'RUBICS', function($q, RUBICS) {
  // TODO make the service into a provider and make the URL configurable
  var context = cubism.context()
    .serverDelay(60 * 1000)
    .step(60 * 1000)
    .size(1440);

  //TODO changes to the cubism global handler
  //d3.select(window).on("keydown.rubicsapp", function() {
  //  switch (!d3.event.metaKey && d3.event.keyCode) {
  //    case 37: // left
  //    case 39: // right
  //      break;
  //    default: return;
  //  }
  //  var tag = d3.event.target.tagName.toUpperCase();
  //  if (tag === 'INPUT' || tag === 'TEXTAREA') {
  //    return;
  //  }
  //  d3.event.preventDefault();
  //});

  var graphite = context.graphite(RUBICS.GRAPHITE_URL);

  return {
    getContext: function() { return context; },

    getGraphite: function() { return graphite; },

    find: function(path) {
      console.info("Finding metric for: " + path);
      var validateOnly = false;
      var fnPrefix = "";
      var fnSuffix = "";
      var fns = path.match(/^(.*\()([^)]+)(\).*)$/);
      if (fns && fns.length == 4) {
        fnPrefix = fns[1];
        fnSuffix = fns[3];
        path = fns[2];
        if (fns[2] && fns[2].match(/\$\*/)) {
          //if a $* is found we expand all the metrics
          path = path.replace(/\$\*/g, '*');
        } else {
          //just use find for validation
          validateOnly = true;
        }
      }
      var deferred = $q.defer();
      graphite.find(path, function(error, results) {
        if (error) {
          console.error("Finding metric returned error: " + error);
          deferred.reject(error);
        } else {
          console.info("Found: " + results);
          deferred.resolve(results && results.length > 0 ? validateOnly ? [fnPrefix + path + fnSuffix] : results.sort().map(function (m) { return fnPrefix + m + fnSuffix; }) : []);
        }
      });
      return deferred.promise;
    }
  };
}]);  //cubismService


rubicsApp.controller("MetricsCtrl", ['$scope', 'storageService', 'remoteStorageService', 'cubismService', 'RUBICS', function($scope, storageService, remoteStorageService, cubismService, RUBICS) {

  function d3_colors10() {
    var colors = d3.scale.category10();
    colors.domain([1]);
    return colors.range();
  }
  var metricColorIndex = 0;
  var metricColors = d3_colors10();

  $scope.dashboards = storageService.items();
  remoteStorageService.items().then(function(items) { $scope.remoteDashboards = items; });
  $scope.dashboardName = "My Shiny New Dashboard";
  $scope.dashboardNewName = "My Shiny New Dashboard";

  $scope.editMetrics = false;
  $scope.metricFind = RUBICS.DEFAULT_METRIC;
  $scope.metricName = RUBICS.DEFAULT_METRIC_NAME;
  $scope.metricColor = metricColors[metricColorIndex++];

  $scope.metricGroups = [];
  $scope.vars = [];
  $scope.uniqueVars = {};

  $scope.addMetric = function() {
    var m_path = $scope.metricFind;
    var m_name = $scope.metricName || m_path;
    var m_color = $scope.metricColor;

    var vars = m_path.match(/(\$[A-Za-z0-9_]+)/g);
    if (vars) {
      // Now ignore the already defined variables
      vars = vars.filter(function(n) { return !$scope.uniqueVars[n]; });
      if (vars.length > 0) {
        vars.forEach(function(n) { $scope.uniqueVars[n] = ""; });
        $scope.vars = $scope.vars.concat(vars.map(function(n) { return { name: n, value: ''}; })).sort(function(a, b) {
          if (a.name < b.name) return -1;
          if (a.name > b.name) return 1;
          return 0;
        });
      }
      $scope.metricGroups.push({name:m_name, find:m_path, metrics:[], color:m_color, hide:false});
    } else {
      cubismService.find(m_path).then(function (fetched) {
        if (fetched.length > 0) {
          $scope.metricGroups.push({name:m_name, find:m_path, metrics:fetched, color:m_color, hide:false});
        } else {
          console.info("There no results when finding metric path " + m_path);
        }
      }, function () {
        console.error("There was an error finding metric path " + m_path);
      });
    }

    //$scope.metricFind = ''; //TODO Commented for testing
    $scope.metricName = '';
    $scope.metricColor = metricColors[metricColorIndex++ % metricColors.length];
  };

  $scope.updateVars = function() {

    angular.forEach($scope.vars, function(v) {
      $scope.uniqueVars[v.name] = v.value || "";
    });

    angular.forEach($scope.metricGroups, function(m) {
      var vars = m.find.match(/(\$[A-Za-z0-9_]+)/g);
      if (vars && vars.length > 0) {
        console.log("Updating vars in " + m.find);
        var m_path = m.find;
        // Sort so that we replace the largest variable first. This prevents a smaller variable name contained in a larger variable name
        vars.sort(function(a, b) { return b.length - a.length; });
        console.log(vars);
        angular.forEach(vars, function(v) {
          m_path = m_path.replace(v, $scope.uniqueVars[v]);
        });
        console.log("to " + m_path);
        cubismService.find(m_path).then(function (fetched) {
          console.log("Update found: " + fetched);
          if (fetched.length > 0) {
            m.metrics = fetched;
          } else {
            m.metrics = [];
          }
        });
      }
    });
  };

  $scope.saveDashboard = function() {
    if (storageService.load($scope.dashboardNewName)) {
      // TODO add prompt to overwrite
    }
    var name = $scope.dashboardNewName;
    var data = { metricGroups: $scope.metricGroups, vars: $scope.vars, metricColorIndex: metricColorIndex };
    if (/^r\//.test(name)) {
      name = name.substr(2);
      remoteStorageService.save(name, data).then(function (name) {
        $scope.remoteDashboards = $scope.remoteDashboards || [];
        $scope.remoteDashboards.push(name);
      });
    } else {
      storageService.save(name, data);
      $scope.dashboards = storageService.items();
    }
    $scope.dashboardName = name;
  };

  function _loadDashboard(name, data) {
    if (data) {
      $scope.dashboardName = name;
      $scope.metricGroups = data.metricGroups;
      angular.forEach(data.vars, function(v) {
        $scope.uniqueVars[v.name] = v.value || "";
      });
      $scope.vars = data.vars;
      metricColorIndex = data.metricColorIndex;
      $scope.metricColor = metricColors[(metricColorIndex - 1) % metricColors.length];
    }
  }
  $scope.loadDashboard = function(name) {
    //TODO add prompt to prevent destroying the current dashboard without saving first
    if (name) {
      //Load an existing dashboard
      if (/^r\//.test(name)) {
        name = name.replace(/^r\//, '');
        remoteStorageService.load(name).then(function(data) {
          _loadDashboard(name, data);
        });
      } else {
        _loadDashboard(name, storageService.load(name));
      }
    } else {
      // Create a new one
      _loadDashboard("My Shiny New Dashboard", { metricGroups: [], vars: [], metricColorIndex: 1 });
    }
  };

}]); // End MetricsCtrl,


rubicsApp.directive('charts', ['cubismService', function(cubismService) {

  function addAxis(context, element) {
    d3.select(element).selectAll(".bottom.axis")
      .data(["bottom"]).enter().append("div").attr("class", "fluid-row")
      .attr("class", function(d) { return d + " axis"; })
      .each(function(d) { d3.select(this).call(context.axis().ticks(12).orient(d)); });

    d3.select(element).selectAll(".top.axis")
      .data(["top"]).enter().insert("div", ":first-child").attr("class", "fluid-row")
      .attr("class", function(d) { return d + " axis"; })
      .each(function(d) { d3.select(this).call(context.axis().ticks(12).orient(d)); });

    d3.select(element).append("div").attr("class", "rule")
      .call(context.rule());

    context.on("focus", function(i) {
      d3.select(element).selectAll(".value").style("right", i == null ? null : context.size() - 1 - i + "px");
    });
  }

  function link (scope, element, attr) {
    addAxis(cubismService.getContext(), element[0]);
  }

  return {
    link: link,
    restrict: 'E',
    scope: {}
  }
}]);  // charts


rubicsApp.directive('horizonChart', ['cubismService', function(cubismService) {
// From: https://stackoverflow.com/a/13542669
  function shadeColor(color, percent) {
    var f=parseInt(color.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent,R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
    return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
  }

  function generateShades(baseColor) {
    var positive = [ baseColor ];
    var negative = [ shadeColor(baseColor,-0.15) ];
    var offset = 0.40;
    for(var i=0;  i < 3; i++) {
      positive.unshift(shadeColor(positive[0],offset));
      negative.push(shadeColor(negative[negative.length - 1],offset));
    }
    return negative.concat(positive);
  }

  function link (scope, element, attr) {
    scope.shades = generateShades(scope.hcMetrics.color);
    console.log(scope.shades);
    scope.$watch('hcMetrics.metrics', function(metrics) {
      console.log('Metric changed: ' + metrics);
      var selection = d3.select(element[0]).selectAll(".horizon").data(metrics, function(d) {return d;});
      //console.log('enter');
      selection.enter().append("div").attr("class", "horizon").call(cubismService.getContext().horizon().colors(scope.shades).metric(function(d) {return cubismService.getGraphite().metric(d);}));
      //console.log('exit');
      selection.exit().call(cubismService.getContext().horizon().remove).remove();
      //console.log('done');
    });

    scope.$watch('hcEditMode', function(editMode) {
      console.log("hcEditMode changed: " + editMode);
      if (editMode) {
        scope.removeList = {};
        d3.select(element[0]).selectAll(".horizon").insert("div", ":first-child").attr("class", "horizon-remove pull-right").append("button").attr("class", "btn btn-sm btn-default").on("click.hcremove", function(d) {
          scope.removeList[d] = scope.removeList[d] ? 0 : 1;
          d3.select(this).classed({'active': scope.removeList[d], 'btn-default': !scope.removeList[d], 'btn-danger': scope.removeList[d] });
          console.log("Remove " + d);
        }).append("span").attr("class", "glyphicon glyphicon-remove");
      } else if (scope.removeList) {
        var selection = d3.select(element[0]).selectAll(".horizon .horizon-remove");
        selection.select("button").on("click.hcremove", null);
        selection.remove();
        var newMetrics = scope.hcMetrics.metrics.filter(function (d) {
          return !scope.removeList[d];
        });
        if (scope.hcMetrics.metrics.length !== newMetrics.length) {
          scope.hcMetrics.metrics = newMetrics;
          //console.log("New metrics: " + newMetrics);
        }
      }
    });
  }

  return {
    link: link,
    restrict: 'E',
    scope: {
      hcMetrics: '=',
      hcEditMode: '='
    }
  }
}]);  // horizonChart
