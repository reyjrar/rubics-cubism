# Rubics Cubism #

Often times, I find myself looking at graphs generated from Graphite and
wishing I could align the graphs to find correlated metrics easily.  This
project uses Mike Bostock's [Cubism](https://square.github.io/cubism/) to
densely display time aligned metrics on a single page.

[AngularJS](http://angularjs.org) is used to create a page that is user
editable.  I don't always know what metrics I want to see when, but I'd prefer
to do all the modifications in the browser.

# TODO #

* Metrics
  * Done: Controller/View to allow exclusion of metrics
  * Done: Edit Metrics using Controller/View
  * Done: Allow "variables" in metric path, example:
    * sys.$HOST.loadavg.\*
    * Creates a HOST:[     ] input field in the interface.
    * Set "box-001.example.com" hit "Update" and metrics
      are refreshed on the page.
  * Done: Support for functions like sumSeries(security.logging.indexer.logproc-1\*.total), which sent to graphite as is
  * Done: Support for functions which expand the metric with a $\* instead od a \* like nonNegativeDerivative(general.es.logsearch-$\*.http.total_opened), which will be expanded into multiple graphs
* Dashboards
  * Done: Controller/View to allow saving dashboards by name
  * Backends for Dashboard Storage?

# Credits #
 * [Cubism](https://square.github.io/cubism/)
 * [AngularJS](http://angularjs.org)
 * [Bootstrap](http://getbootstrap.com)
 * [Angular Bootstrap Colorpicker](https://github.com/buberdds/angular-bootstrap-colorpicker)
 * [jQuery](http://jquery.org)
