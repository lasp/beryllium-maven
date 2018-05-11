(function() {

/**
 * Main Controller for the beryllium-maven application.
 */
angular
.module("beryllium-maven")
.controller("MainController", [
    'webGl',
    function( webGl ) {
        var ctrl = this;
        this.webGlAvailable = webGl.isWebGlAvailable();
    }
]);

})();
