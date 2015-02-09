var rubicsApp = angular.module("rubicsApp", [
  'colorpicker.module'
]);


rubicsApp.factory('cubismService', ['$q', function($q) {
  // TODO make the service into a provider and make the URL configurable
  var context = cubism.context()
    .serverDelay(60 * 1000)
    .step(60 * 1000)
    .size(1440);

  var graphite = context.graphite("http://graphite.booking.com");

  return {
    getContext: function() { return context; },

    getGraphite: function() { return graphite; },

    find: function(path) {
      console.info("Finding metric for: " + path);
      var deferred = $q.defer();
      graphite.find(path, function(error, results) {
        if (error) {
          console.error("Finding metric returned error: " + error);
          deferred.reject(error);
        } else {
          console.info("Found: " + results);
          deferred.resolve(results && results.length > 0 ? results.sort() : []);
        }
      });
      return deferred.promise;
    }
  };
}]);


rubicsApp.controller("MetricsCtrl", ['$scope', 'cubismService', function($scope, cubismService) {

  var metricColorIndex = 0;
  var metricColors = [
    '#0094ff',
    //TODO get rid of this ugly colours and put in something nicer
    '#ff9900',
    '#00ff38',
    '#cc00ff',
    '#ff0000',
    '#00ffc2',
    '#fa00ff'
  ];

  $scope.editMetrics = false;
  $scope.metricFind = 'security.logging.indexer.*.total'; //TODO this is a default for testing
  $scope.metricName = '';
  $scope.metricColor = metricColors[metricColorIndex++];
  $scope.metricGroups = [];
  $scope.vars = [];
  $scope.uniqueVars = {};

  $scope.addMetric = function() {
    var m_path = $scope.metricFind;
    var m_name = $scope.metricName || m_path;
    var m_color = $scope.metricColor;

    var vars = m_path.match(/(\$[A-Za-z0-9_]*)/g);
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
        }
      }, function () {
        console.error("There was an error finding metric path " + m_path);
      });
    }

    //$scope.metricFind = ''; //TODO Commented for testing
    $scope.metricName = '';
    $scope.metricColor = metricColors[metricColorIndex++];
    if (metricColorIndex >= metricColors.length) {
      metricColorIndex = 0;
    }
  };

  $scope.updateVars = function() {

    angular.forEach($scope.vars, function(v) {
      $scope.uniqueVars[v.name] = v.value || "";
    });

    angular.forEach($scope.metricGroups, function(m) {
      var vars = m.find.match(/(\$[A-Za-z0-9_]*)/g);
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
}]);


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
}]);
