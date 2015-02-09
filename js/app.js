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
      console.log("Finding: " + path);
      var deferred = $q.defer();
      graphite.find(path, function(error, results) {
        deferred.resolve(results && results.length > 0 ? results.sort() : []);
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
        $scope.vars = $scope.vars.concat(vars.map(function(n) { return { name: n, value: ''}}));
        vars.forEach(function(n) { $scope.uniqueVars[n] = ""; });
      }
      $scope.metricGroups.push({name:m_name, find:m_path, metrics:[], color:m_color, hide:false});
    } else {
      cubismService.find(m_path).then(function (fetched) {
        if (fetched.length > 0) {
          $scope.metricGroups.push({name:m_name, find:m_path, metrics:fetched, color:m_color, hide:false});
        }
      });
    }

    //$scope.metricFind = ''; //TODO Commented for testing
    $scope.metricName = '';
    $scope.metricColor = metricColors[metricColorIndex++];
    if (metricColorIndex >= metricColors.length) {
      metricColorIndex = 0;
    }
  };

  $scope.toggleEditMode = function() {
    $scope.editMetrics = !$scope.editMetrics;
    if ($scope.editMetrics) {
      d3.selectAll(".horizon").each(function() {d3.select(this).append("span").attr("class", "horizon-remove glyphicon glyphicon-remove")});
    } else {
      d3.selectAll(".horizon .horizon-remove").remove();
    }
  };

  $scope.updateVars = function() {
    angular.forEach($scope.metricGroups, function(m) {
      var vars = m.find.match(/(\$[A-Za-z0-9_]*)/g);
      if (vars && vars.length > 0) {
        console.log("Updating vars in " + m.find);
        var m_path = m.find;
        angular.forEach($scope.vars, function(v) {
          m_path = m_path.replace(v.name, v.value);
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
    scope.shades = generateShades(scope.m.color);
    console.log(scope.shades);
    scope.$watch('m.metrics', function(metrics) {
      console.log('Watch ' + metrics);
      var data = [];
      angular.forEach(metrics, function(d) {
        console.log("fetching: " + d);
        data.push(cubismService.getGraphite().metric(d));
      });
      var selection = d3.select(element[0]).selectAll(".horizon").data(data);
      console.log('enter');
      selection.enter().append("div").attr("class", "horizon").call(cubismService.getContext().horizon().colors(scope.shades));
      console.log('exit');
      selection.exit().call(cubismService.getContext().horizon().remove).remove();
      console.log('done');
    });
  }

  return {
    link: link,
    restrict: 'E',
    scope: {
      m: '='
    }
  }
}]);
