(function() {

angular
.module("beryllium-maven")
.component("legend", {
    templateUrl: "components/legendComponent/legend.component.html",
    require: { cesium: "^^cesium" },
    bindings: {
        "showSubsolarPoint": "=",
        "showGroundTrack": "=",
        "selectedParam1d": "<",
        "selectedParam3d": "<",
        "selectedParamMgitm": "<",
        "params1d": "<",
        "params3d": "<",
        "paramsMgitm": "<"
    },
    controller: [
        "$scope",
        "kpDataTransformer",
        "mgitmDataTransformer",
        "berylliumColors",
        legendController
    ]
});

function legendController( $scope, kpDataTransformer, mgitmDataTransformer, berylliumColors ) {
    var vm = this;

    // Sets variables of data provided by the kpDataTransformer
    var kpProperties;
    kpDataTransformer.dataReady.addEventListener(function( _properties ) {
        kpProperties = _properties;
        vm.orbitPathColormap = kpProperties.orbitPathColormap;
        vm.whiskerColormap = kpProperties.whiskerColormap;
        vm.minOrbitColorParam = kpProperties.minOrbitColorParam;
        vm.maxOrbitColorParam = kpProperties.maxOrbitColorParam;
        vm.minWhiskerMagnitude = kpProperties.minWhiskerMagnitude;
        vm.maxWhiskerMagnitude = kpProperties.maxWhiskerMagnitude;
    });

    // Sets variables of data provided by the mgitmDataTransformer
    var mgitmProperties;
    mgitmDataTransformer.dataReady.addEventListener(function( _properties ) {
        mgitmProperties = _properties;
        vm.mgitmColormap = mgitmProperties.mgitmColormap;
        vm.minMgitm = mgitmProperties.minMgitm;
        vm.maxMgitm = mgitmProperties.maxMgitm;
    });

    //////////* Variables dealing with background gradient styles *//////////

    // Creates a computed variable for the orbit path gradient css
    Object.defineProperty(vm, 'orbitPathGradient', {
        get: function() { return berylliumColors.colorMapToCSSBackground(vm.orbitPathColormap) }
    });

    // Creates a computed variable for the whisker gradient css
    Object.defineProperty(vm, 'whiskerGradient', {
        get: function() { return berylliumColors.colorMapToCSSBackground(vm.whiskerColormap) }
    });

    // Creates a computed variable for the mgitm gradient css
    Object.defineProperty(vm, 'mgitmGradient', {
        get: function() { return berylliumColors.colorMapToCSSBackground(vm.mgitmColormap) }
    });

    //////////* Variables and functions dealing with parameter units *//////////

    // Creates a computed variable for the 1d units
    Object.defineProperty(vm, 'selectedParam1dUnits', {
        get: function() { return getParamUnits(vm.params1d, vm.selectedParam1d) }
    });

    // Creates a computed variable for the 3d units
    Object.defineProperty(vm, 'selectedParam3dUnits', {
        get: function() { return getParamUnits(vm.params3d, vm.selectedParam3d) }
    });

    // Creates a computed variable for the mgitm units
    Object.defineProperty(vm, 'selectedParamMgitmUnits', {
        get: function() { return getParamUnits(vm.paramsMgitm, vm.selectedParamMgitm) }
    });

    // Computes the units of the given parameter
    // Returns 'No Data' if it does not exist in the given parameters object array
    function getParamUnits(params, selectedParam) {
        var param = params.find(function(param) { return param.value === selectedParam; });
        return param ? param.units : "No Data";
    }

    //////////* Variables and functions dealing with parameter display names *//////////

    // Creates a computed variable for the 1d parameter display name
    Object.defineProperty(vm, 'selectedParam1dDisplay', {
        get: function() { return getParamDisplay(vm.params1d, vm.selectedParam1d) }
    });

    // Creates a computed variable for the 3d parameter display name
    Object.defineProperty(vm, 'selectedParam3dDisplay', {
        get: function() { return getParamDisplay(vm.params3d, vm.selectedParam3d) }
    });

    // Creates a computed variable for the mgitm parameter display name
    Object.defineProperty(vm, 'selectedParamMgitmDisplay', {
        get: function() { return getParamDisplay(vm.paramsMgitm, vm.selectedParamMgitm) }
    });

    // Computes the display name of the given parameter
    // Returns 'none' if it does not exist in the given parameters object array
    function getParamDisplay(params, selectedParam) {
        var param = params.find(function(param) { return param.value === selectedParam; });
        return param ? param.display : "none";
    }
}

})();
