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

  $scope.metricFind = 'security.logging.indexer.*.total'; //TODO this is a default for testing
  $scope.metricName = '';
  $scope.metricColor = metricColors[metricColorIndex++];
  $scope.metrics = [];

  $scope.addMetric = function() {
    var m_path = $scope.metricFind;
    var m_name = $scope.metricName || m_path;
    var m_color = $scope.metricColor;

    cubismService.find(m_path).then(function (fetched) {
      if (fetched.length > 0) {
        $scope.metrics.push({name:m_name, find:m_path, metrics:fetched, color:m_color, hide:false});
      }
    });

    //$scope.metricFind = ''; //TODO Commented for testing
    $scope.metricName = '';
    $scope.metricColor = metricColors[metricColorIndex++];
    if (metricColorIndex >= metricColors.length) {
      metricColorIndex = 0;
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
    var data = [];
    $(scope.m.metrics).each(function(i, d) {
      console.log("fetching " + d);
      data.push(cubismService.getGraphite().metric(d));
    });
    var shades = generateShades(scope.m.color);
    console.log(shades);
    d3.select(element[0]).selectAll(".horizon")
      .data(data).enter().append("div")
      .attr("class", "horizon").call(cubismService.getContext().horizon().colors(shades));
  }

  return {
    link: link,
    restrict: 'E',
    scope: {
      m: '='
    }
  }
}]);
