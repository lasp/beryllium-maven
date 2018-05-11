(function() {

angular
.module( 'beryllium', [ 'angular-sortable-view', 'laspChart', 'LZString', 'moment-strict', 'ngMaterial', 'ngMessages', 'ngSanitize', 'ui.bootstrap' ])
.config([
    '$mdDateLocaleProvider',
    function( $mdDateLocaleProvider ) {
        $mdDateLocaleProvider.formatDate = function( date ) {
            if( !date ) {
                return "";
            }
            else {
                return date.toISOString().split('T')[0];
            }
        }
    }
]);

})();
(function() {

/**
 * <cesium> component
 *
 * This component renders a Cesium frame onto the page. It accepts
 * sub-components inside the <cesium>...</cesium> tags; it will not
 * render them (unless they're transcluded elements, more on those below),
 * but they will be able to modify the behavior of this
 * component via the API exposed via the controller. This is often
 * used to do things like:
 *
 * 1. Modify how the Cesium Viewer is created/configured
 * 2. Add Entities and Primites to the Cesium Viewer (by default
 * 		there are none)
 * 3. Listen to the onTick event of the Cesium.Clock
 *
 * In order to access the Controller API, inner components and directives
 * should require "^^cesium". How that works, exactly, is different
 * for directives vs components, but it can be done for either. for
 * more details, see:
 *
 * https://docs.angularjs.org/guide/component#intercomponent-communication
 * https://docs.angularjs.org/guide/directive#creating-directives-that-communicate
 *
 * As mentioned above, Cesium has three transclusion slots where you can add app-specific content:
 *
 * 1. highstockPaneContent: content for the highstock pane (the right pane of the split pane view)
 * 2. legendContent: content for the legend
 * 3. sideNavContent: content for the controls sidenav
 *
 * The Controller API:
 *
 * cesium.makeViewer( startTime, endTime, configFn ): Initializes the Cesium.Viewer.
 * 		This *must* be called by an internal directive or the Viewer will never be
 * 		created. Returns a reference to the created Viewer. Also triggers any listeners
 * 		bound by onViewerReady after a 0ms timeout (the timeout allows the caller to
 * 		continue configuring the Viewer, since some configuration can only be done
 * 		after instantiation)
 *
 * cesium.onViewerReady( listener ): Register a listener function that will be called
 * 		and passed the Viewer once it has been created.
 *
 * cesium.setCesiumDates( timeframe ): Given a timeframe object of the form
 * 		{ start: Date, end: Date }, set the startTime and endTime of the associated
 * 		Cesium.Clock instance. This will also trigger the onCesiumDatesChanged binding,
 * 		if it has been bound.
 *
 * cesium.onReferenceFrameChange( listener ): Register a listener that will be called
 * 		with the current reference frame ("inertial" or "planetary") when a change is
 * 		detected.
 *
 * cesium.deleteEntity( entityOrPrimitive ): Utility function that can delete just about
 * 		anything from the Cesium.Viewer. Accepted types are:
 * 		* undefined (does nothing, but occasionally useful)
 * 		* Entity
 * 		* Primitive
 * 		* PrimitiveCollection
 * 		* an Array of any of the above
 *
 * cesium.defaultAvailability(): Utility function that returns a TimeIntervalCollection
 * 		collection representing the full extent of the Cesium.Clock instance's time range.
 * 		This is often useful when creating entities, as in:
 * 			viewer.entities.add({
 * 				// etc
 *				availability: vm.cesium.defaultAvailability()
 * 			})
 */
angular
.module("beryllium")
.component("cesium", {
	templateUrl: "components/cesiumComponent/cesium.component.html",
	transclude: {
		'highstockPaneContent': '?highstockPaneContent',
		'legendContent': '?legendContent',
		'sideNavContent': '?sideNavContent'
	},
	bindings: {
		onCesiumViewerAvailable: '&',
		onCesiumDatesChanged: '&',
		referenceFrame: '<'
	},
	controller: [
		'$scope',
		cesiumController
	]
})
.config(['$httpProvider', function( $httpProvider ) {
	// Include the error message interceptor in the interceptors
	// list that http requests must go through.
	$httpProvider.interceptors.push('errorMessageInterceptor');
}]);

var instanceIndex = 1;

function cesiumController( $scope ) {
	var vm = this;

	vm.cesiumElId = "cesium-render-target-" + (instanceIndex++);

    // Variables related to content visibility
    vm.legendOpen = false;
    vm.plotPaneOpen = true;
    vm.sidenavOpen = false;

    // Variables related to the split pane view
    vm.defaultCesiumPaneSize = 45;
    vm.gutterSize = 8;
    vm.cesiumPaneWidth = 'calc(' + vm.defaultCesiumPaneSize + '% - ' + vm.gutterSize / 2 + 'px)';
    vm.highstockPaneWidth = 'calc(' + (100 - vm.defaultCesiumPaneSize) + '% - ' + vm.gutterSize / 2 + 'px)';

    // Have to wait for the component templates to load via the digest cycle before calling Split
    $scope.$$postDigest(function() {
    	// Initialize the split pane functionality
        Split(['#cesium-container', '#highstock-container'], {
            direction: 'horizontal',
            sizes: [vm.defaultCesiumPaneSize, 100 - vm.defaultCesiumPaneSize],
             gutterSize: vm.gutterSize,
            cursor: 'col-resize',
			onDrag: vm.onPaneDrag
        });
    });

    // Callback for when the split pane gutter is dragged
    vm.onPaneDrag = function() {
    	// some content needs this in order to update its size when the pane widths change.
		// lasp-highstock, for example, won't resize without this.
        $scope.$digest();
    };

	// This is the LASP default Bing Maps API Key.
	Cesium.BingMapsApi.defaultKey = "ApShDVXdpWGlIBVUFqN0tGVEnVpLvvuo3Xoml6WCqTapFRsS31KBf7dr-9WXWbxD";

	vm.$onChanges = function( changesObj ) {
		if( changesObj.hasOwnProperty("referenceFrame") ) {
			referenceFrameChangeListeners.forEach(function( listener ) {
				listener( changesObj.referenceFrame.currentValue );
			});
		}
	};

	vm.makeViewer = function( startTime, endTime, configFn ) {
		configFn = configFn || function() {};

		startTime = Cesium.JulianDate.fromDate( startTime );
		endTime = Cesium.JulianDate.fromDate( endTime );

		var clock = new Cesium.Clock({
			startTime: startTime,
			stopTime: endTime,
			currentTime: startTime,
			clockRange: Cesium.ClockRange.LOOP_STOP,
			multiplier: 1000
		});

		var config = {
			clock: clock,
			fullscreenButton: false
		};

		if( configFn ) {
			config = configFn( config ) || config;
		}

		var viewer = vm.viewer = new Cesium.Viewer( vm.cesiumElId, config );

		// Initialize the referenceFrame's onTick functionality
		referenceFrameListener( vm.referenceFrame );

		// Notify viewerReadyListeners after a brief timeout. This is to allow
		// the caller to have first access to the viewer in case they need to
		// continue configuring it (some configuration can only be done after
		// instantiation)
		setTimeout(
			function() {
				viewerReadyListeners.forEach(function( listener ) {
					listener( viewer );
				});
				vm.onCesiumViewerAvailable({ viewer: viewer });
			},
			0
		);

		return viewer;
	};

	vm.onViewerReady = function( listener ) {
		viewerReadyListeners.push( listener );
	};

	vm.setCesiumDates = function( timeframe ) {
		var min = timeframe.start;
		var max = timeframe.end;

		vm.viewer.clock.startTime = Cesium.JulianDate.fromDate( new Date( min.getTime() ) );
		vm.viewer.clock.stopTime = Cesium.JulianDate.fromDate( new Date( max.getTime() ) );
		vm.viewer.clock.currentTime = Cesium.JulianDate.fromDate( new Date( min.getTime() ) );

		vm.viewer.timeline.zoomTo(
			Cesium.JulianDate.fromDate( new Date( min.getTime() ) ),
			Cesium.JulianDate.fromDate( new Date( max.getTime() ) )
		);

		vm.onCesiumDatesChanged({ timeframe: timeframe });
	};

	vm.onReferenceFrameChange = function( listener ) {
		referenceFrameChangeListeners.push( listener );
	};

	vm.deleteEntity = function( entity ) {
		if( typeof entity === 'undefined' ) {
			return;
		}
		else if( Array.isArray(entity) ) {
			entity.forEach(function(subEntity) {
				if( typeof subEntity !== 'undefined') {
					vm.deleteEntity(subEntity);
				}
			})
		}
		else if( entity.constructor === Cesium.Entity ) {
			vm.viewer.entities.remove(entity);
		}
		else if( entity.constructor === Cesium.Primitive || entity.constructor === Cesium.PrimitiveCollection ) {
			vm.viewer.scene.primitives.remove(entity);
		}
		else {
			throw "Unrecognized type for orbitEntities (" + entity.constructor.name + ")";
		}
	};

	vm.defaultAvailability = function() {
		return new Cesium.TimeIntervalCollection([
			new Cesium.TimeInterval({
				start: vm.viewer.clock.startTime,
				stop: vm.viewer.clock.stopTime
			})
		]);
	};

	var viewerReadyListeners = [];
	var referenceFrameChangeListeners = [];

	vm.onReferenceFrameChange( referenceFrameListener );

    // Toggle the visibility of the highstock plots pane. Retains the previous width before the
    // highstock pane was hidden. Note that this toggles the vm.plotPaneOpen variable as well.
    vm.togglePaneWidths = function() {
        vm.plotPaneOpen = !vm.plotPaneOpen;
        var cesiumContainer = angular.element(document.querySelector('#cesium-container'));
        var highstockContainer = angular.element(document.querySelector('#highstock-container'));
        if(vm.plotPaneOpen) { // Show highstock plots pane
            cesiumContainer.css('width', vm.cesiumPaneWidth);
            highstockContainer.css('width', vm.highstockPaneWidth);
        } else { // Hide highstock plots pane
            vm.cesiumPaneWidth = cesiumContainer.css('width'); // retain current cesium pane width
            vm.highstockPaneWidth = highstockContainer.css('width'); // retain current highstock pane width
            cesiumContainer.css('width', '100%');
            highstockContainer.css('width', '0%');
        }
    };

	function referenceFrameListener( newVal ) {
		if( !vm.viewer ) { return; }

		if( newVal === "inertial" ) {
			vm.viewer.scene.preRender.addEventListener( renderCameraInIcrf );
		}
		else if( newVal === "planetary" ) {
			vm.viewer.camera.lookAtTransform( Cesium.Matrix4.IDENTITY );
			vm.viewer.scene.preRender.removeEventListener( renderCameraInIcrf );
		}
		else {
			throw new Error("Programmer Error: unrecognized value for referenceFrame: '" + newVal + "'");
		}
	}

	function renderCameraInIcrf(scene, time) {
		if (scene.mode !== Cesium.SceneMode.SCENE3D) {
			return;
		}

		var icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
		if (Cesium.defined(icrfToFixed)) {
			var camera = vm.viewer.camera;
			var offset = Cesium.Cartesian3.clone(camera.position);
			var transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
			camera.lookAtTransform(transform, offset);
		}
	}
}

})();

(function() {

/**
 * <date-range-picker> component
 * 
 * Utility widget; usually used to pick date ranges in the sideber
 * of a beryllium app.
 */
angular
.module("beryllium")
.component("dateRangePicker", {
	templateUrl: "components/dateRangePickerComponent/dateRangePicker.component.html",
	bindings: {
		availableMinDate: "<",
		availableMaxDate: "<",
		displayMinDate: "<",
		displayMaxDate: "<",
		maxDurationHours: "@",

		onChange: "&"
	},
	controller: [
		DateRangePickerController
	]
});

function DateRangePickerController() {
	var vm = this;

	vm.format = 'yyyy-MM-dd';

	vm.$onChanges = function( changesObj ) {

		if( changesObj.availableMinDate ) {
			vm.datepickerOptions.minDate = changesObj.availableMinDate.currentValue;
		}
		if( changesObj.availableMaxDate ) {
			vm.datepickerOptions.maxDate = changesObj.availableMaxDate.currentValue;
		}
	};

	vm.datepickerOptions = {
		minDate: vm.availableMinDate,
		maxDate: vm.availableMaxDate
	};

	vm.minDateOpened = false;
	vm.openMin = function() {
		vm.minDateOpened = true;
	};

	vm.maxDateOpened = false;
	vm.openMax = function() {
		vm.maxDateOpened = true;
	};

	vm.errorObj = {};

	vm.reloadClicked = function() {
		vm.errorObj = {};

		// These are parsed from UI values, so we must convert them to
		// UTC manually (datepicker widget assumes local time, not UTC)
		var displayMin = asUtc( vm.displayMinDate ).getTime();
		var displayMax = asUtc( vm.displayMaxDate ).getTime();

		// Since these are passed to us from an external element, we can
		// assume that they are already correct with regards to UTC
		var availMin = vm.availableMinDate.getTime();
		var availMax = vm.availableMaxDate.getTime();

		var maxDuration = -1;
		if( vm.maxDurationHours ) {
			maxDuration = parseInt(vm.maxDurationHours) * 60 * 60 * 1000; // units = ms
		}

		if( displayMax <= displayMin ) {
			vm.errorObj.endBeforeStart = true;
		}
		if( displayMin < availMin ) {
			vm.errorObj.startTooEarly = true;
		}
		if( displayMax > availMax ) {
			vm.errorObj.endTooLate = true;
		}
		if( maxDuration != -1 && Math.abs(displayMax - displayMin) > maxDuration ) {
			vm.errorObj.rangeTooLarge = true;
		}

		var anyErrors = Object.keys( vm.errorObj ).some(function( key ) {
			return vm.errorObj[key];
		});

		if( !anyErrors ) {
			vm.onChange({ start: vm.displayMinDate, end: vm.displayMaxDate });
		}
	};

	function asUtc( date ) {
		return new Date(Date.UTC(
			date.getFullYear(),
			date.getMonth(),
			date.getDate(),
			date.getHours(),
			date.getMinutes(),
			date.getSeconds(),
			date.getMilliseconds()
		));
	}
}

})();
(function() {

// <debug-axis> Component
// 
// This component is intended to be used inside the <cesium> component for debugging.
// It renders 6 axis at various lat/lng coordinates around the globe, and labels them
// appropriately. It is intended to be used to verify that surface maps and data maps
// are mapped to their appropriate locations on the globe.
// 
// The axis appear at the following [lat, lng] coordinate:
// [90, 0] (north pole)
// [-90, 0] (south pole)
// 
// [0, 0] ("origin")
// [0, 90] ("east pole", 90deg east of origin)
// [0, 180] ("anti-origin", opposite origin)
// [0, 270] ("west pole", 90deg west of origin)
angular
.module("beryllium")
.component( "debugAxis", {
	template: "",
	require: {
		cesium: "^^cesium"
	},
	controller: [
		debugAxisController
	]
});

function debugAxisController() {
	var vm = this;

	vm.$onInit = function() {

		vm.cesium.onViewerReady(function( viewer ) {

			var ellipsoid = vm.cesium.viewer.terrainProvider._tilingScheme._ellipsoid;

			var LINE_BOTTOM = 0;
			var LINE_TOP = ellipsoid.maximumRadius;
			var LINE_COLOR = Cesium.Color.RED;

			var northPole = drawLine(90, 0);
			var southPole = drawLine(-90, 0);

			var origin = drawLine(0, 0);
			var eastPole = drawLine(0, 90);
			var antiOrigin = drawLine(0, 180);
			var westPole = drawLine(0, 270);

			// Draw a line with standard height, color and label at the passed lat,lng
			// coordinates
			function drawLine( lat, lng ) {
				return viewer.entities.add({
					position: Cesium.Cartesian3.fromDegrees( lng, lat, LINE_TOP, ellipsoid ),
					polyline: {
						positions: Cesium.Cartesian3.fromDegreesArrayHeights(
							[
								lng, lat, LINE_BOTTOM,
								lng, lat, LINE_TOP
							],
							ellipsoid
						),
						material: LINE_COLOR,
						width: 1
					},
					label: {
						text: "Lat: " + lat + ", Lng: " + lng,
						font: "24px sans-serif",
						eyeOffset: new Cesium.Cartesian3(0, 0, -100)
					}
				})
			}
		});
	}
}

})();
(function() {

/**
 * <single-date-picker> component
 * 
 * Utility widget; usually used to pick date ranges in the sideber
 * of a beryllium app.
 */
angular
.module("beryllium")
.component("singleDatePicker", {
	templateUrl: "components/singleDatePickerComponent/singleDatePicker.component.html",
	bindings: {
		availableMinDate: "<",
		availableMaxDate: "<",
        date: "<",

		onChange: "&"
	},
	controller: [
		SingleDatePickerController
	]
});

function SingleDatePickerController() {
	var vm = this;

	vm.format = 'yyyy-MM-dd';

	vm.$onChanges = function( changesObj ) {

		if( changesObj.availableMinDate ) {
			vm.datepickerOptions.minDate = changesObj.availableMinDate.currentValue;
		}
		if( changesObj.availableMaxDate ) {
			vm.datepickerOptions.maxDate = changesObj.availableMaxDate.currentValue;
		}
	};

	vm.datepickerOptions = {
		minDate: vm.availableMinDate,
		maxDate: vm.availableMaxDate
	};

	vm.dateOpened = false;
	vm.openDate = function() {
		vm.dateOpened = true;
	};

	vm.errorObj = {};

	vm.reloadClicked = function() {
		vm.errorObj = {};

		var DAY_IN_MS = 24 * 60 * 60 * 1000; // units = ms

        var dateUTC = asUtc(vm.date).getTime();
        
		var availMin = vm.availableMinDate.getTime();
		var availMax = vm.availableMaxDate.getTime();

		if( dateUTC < availMin ) {
			vm.errorObj.tooEarly = true;
		}
		if( dateUTC > availMax ) {
			vm.errorObj.tooLate = true;
		}
		
		var anyErrors = Object.keys( vm.errorObj ).some(function( key ) {
			return vm.errorObj[key];
		});

        if( !anyErrors ) {
			vm.onChange({ start: vm.date });
		}
    };

    function asUtc( date ) {
        return new Date(Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            date.getHours(),
            date.getMinutes(),
            date.getSeconds(),
            date.getMilliseconds()
        ));
    }
}

})();

(function() {

/**
 * <web-gl-error> component
 * 
 * Displays a simple error message about WebGL.
 * See "webGl" service for related utility methods.
 * 
 * Typical usage:
 * <web-gl-error ng-if="!myCtrl.webGl"></web-gl-error>
 * <my-app ng-if="myCtrl.webGl"></my-app>
 */
angular
.module("beryllium")
.component("webGlError", {
	templateUrl: "components/webGlErrorComponent/webGlError.component.html",
});

})();
(function() {

// [collapse-container] directive
//
// This directive is one of three parts of the expand-collapse
// system. The parts are: collapse-container, collapse-trigger,
// collapse-target. They are typically arranged like this:
//
//    <div collapse-container>
//        <div>Title <collapse-trigger></collapse-trigger></div>
//        <collapse-target>
//            <div><!-- content --></div>
//        </collapse-target>
//    </div>
//
// The <collapse-trigger> element is a little up/down arrow
// that controls whether or not the <collapse-target> is
// collapsed. The [collapse-container] simply acts as message
// relay; when the <collapse-trigger> is clicked it sends a
// message up to the [collapse-container]. The [collapse-container]
// then passes the message on to any <collapse-target>s that
// live inside it.
angular
.module("beryllium")
.directive("collapseContainer", [
    function() {

        return {
            restrict: 'A',
            controller: [
                CollapseContainerController
            ]
        };
    }
]);

function CollapseContainerController() {

    var collapseListeners = [];
    var _isCollapsed = false;

    this.onCollapseChange = function( listener ) {
        collapseListeners.push( listener );
        notifyListener( listener );
    };

    this.setCollapsed = function( isCollapsed ) {
        _isCollapsed = isCollapsed;
        collapseListeners.forEach( notifyListener );
    };

    this.toggleCollapsed = function() {
        this.setCollapsed( !_isCollapsed );
    };

    this.isCollapsed = function() {
        return _isCollapsed;
    };

    function notifyListener( listener ) {
        listener( _isCollapsed );
    }
}



})();

(function() {

// <collapse-target> directive
//
// See the [collapse-container] directive for more details
angular
.module("beryllium")
.directive("collapseTarget", [
    "$timeout",
    function( $timeout ) {
        return {
            restrict: 'E',
            require: '^^collapseContainer',
            link: function(scope, element, attrs, collapseContainerCtrl) {

                initMaxHeight();

                collapseContainerCtrl.onCollapseChange(function( isCollapsed ) {

                    // Attempt to keep the max-height up-to-date if the element's
                    // height changes
                    var height = elementHeight();
                    if( height !== 0 ) {
                        element.css("max-height", height + "px");
                    }

                    // Add or remove the .collapsed class. If class is removed,
                    // css will fall back to the element-level max-height style
                    // that we set.
                    element.toggleClass( "collapsed", isCollapsed );

                });

                // Repeatedly try to get the height of element. If the measured
                // height is 0, set a timeout and try again later. If the measured
                // height is >0, declare victory, set element's max-height accordingly,
                // and finish.
                function initMaxHeight() {
                    var height = elementHeight();
                    if( height > 0 ) {
                        element.css("max-height", height + "px");
                    }
                    else {
                        $timeout( initMaxHeight, 100 );
                    }
                }

                // There are a lot of different ways to get the height of an element,
                // with annoyingly small levels of nuance between them. This is a
                // convenience function so that we can change it in only one place.
                //
                // clientHeight: height of only the content box
                // offsetHeight: height of the content box + padding + border
                // scrollHeight: height of the stuff *inside* the content box
                //        (will be >clientHeight if you can scroll this element)
                function elementHeight() {
                    return element[0].scrollHeight;
                }

            }
        };
    }
]);

})();

(function() {

// <collapse-trigger> directive
//
// See the [collapse-container] directive for more details
angular
.module("beryllium")
.directive("collapseTrigger", [
    function() {
        return {
            restrict: 'E',
            template: "<md-icon>{{className}}</md-icon>",
            require: '^^collapseContainer',
            scope: {},
            link: function(scope, element, attrs, collapseContainerCtrl) {

                var vm = scope;

                // This will be initialized once we get the current isCollapsed
                // state from the collapseContainerCtrl
                vm.className = "";

                element.on("click", function(e) {
                    collapseContainerCtrl.toggleCollapsed();
                });

                collapseContainerCtrl.onCollapseChange(function( isCollapsed ) {
                    vm.className = isCollapsed ? "expand_more" : "expand_less";

                    // Most of the time when this event is triggered, we're not in a digest
                    // cycle (happens during a click event) and so we need to call $digest.
                    // However, the first time this gets called is while we're registering
                    // the event handler and that does happen to be inside a digest loop.
                    // This is apparently really not how you're supposed to do this sort
                    // of thing, but I haven't come across any better solutions yet.
                    //
                    // http://stackoverflow.com/questions/12729122/angularjs-prevent-error-digest-already-in-progress-when-calling-scope-apply
                    if( !(scope.$$phase || scope.$root.$$phase) ){
                      scope.$digest();
                    }
                });

            }
        };
    }
]);

})();

(function() {

// [loading-icon] directive
//
// This directive displays the associated element whenever there
// is a pending http request. Example use:
//
//	<div id="loading-indicator" loading-icon>
//      <md-progress-circular md-mode="intermediate"></md-progress-circular>
//  </div>

angular
.module("beryllium")
.directive("loadingIcon", ['$http' ,
    function($http) {
        return {
            restrict: 'A',
            link: function (scope, elm, attrs) {
                scope.$watch(function() {
                    return $http.pendingRequests.length > 0;
                }, function( isPending ) {
                    if (isPending) {
                        $(elm).css('display', 'block');
                    } else {
                        $(elm).css('display', 'none');
                    }
                });
            }
        };
    }
]);

})();
'use strict';


/*
 * Returns a shortened or lengthened number based on the desired length.
 * If the number is greater than the desired length, it will return
 * the number in exponential form with the desired exponential length.
 * If the number is less than the desired length, it will suffix zeros
 * until it is the desired length.
 */
angular
    .module("beryllium")
    .filter("numLen", [
        numLenFilter
    ]);

function numLenFilter() {
    // Allows for String.prototype.repeat to work on IE
    if (!String.prototype.repeat) {
        String.prototype.repeat = function(count) {
            'use strict';
            if (this == null) {
                throw new TypeError('can\'t convert ' + this + ' to object');
            }
            var str = '' + this;
            count = +count;
            if (count != count) {
                count = 0;
            }
            if (count < 0) {
                throw new RangeError('repeat count must be non-negative');
            }
            if (count == Infinity) {
                throw new RangeError('repeat count must be less than infinity');
            }
            count = Math.floor(count);
            if (str.length == 0 || count == 0) {
                return '';
            }
            // Ensuring count is a 31-bit integer allows us to heavily optimize the
            // main part. But anyway, most current (August 2014) browsers can't handle
            // strings 1 << 28 chars or longer, so:
            if (str.length * count >= 1 << 28) {
                throw new RangeError('repeat count must not overflow maximum string size');
            }
            var rpt = '';
            for (;;) {
                if ((count & 1) == 1) {
                    rpt += str;
                }
                count >>>= 1;
                if (count == 0) {
                    break;
                }
                str += str;
            }
            return rpt;
        }
    }

    return function(num, desiredLen, expLen) {
        if (typeof(num) === 'number') {
            var numString = num.toLocaleString();
            var numLength = numString.replace('.', '').replace(',', '').replace('-', '').length;
            if (numLength > desiredLen) {
                return num.toExponential(expLen);
            } else if (numLength < desiredLen) {
                if (Number.isInteger(num)) { return numString.concat('.').concat('0'.repeat(desiredLen - numLength)); }
                else { return numString.concat('0'.repeat(desiredLen - numLength)); }
            } else {
                return numString;
            }
        } else {
            return num;
        }
    }
}

(function() {

/**
 * AbstractClass service
 * 
 * Service returns the AbstractClass function, which can be used to create
 * other 'class' functions.
 * 
 * Many of the services in the beryllium module use prototypal inheritance.
 * There are a lot of ways that prototypal inheritance can be implemented,
 * with subtle differences between all of them. I've created this 'class'
 * to provide a standard implementation through all of my services, and to
 * act as a superclass to all classes created this way.
 * 
 * Some notes about this particular implementation:
 * 
 * 1. The subclass prototype is created using Object.create( superclass.prototype ),
 * 		which increasingly seems like the standard way to do this.
 * 2. The property subclass.prototype.constructor is set to subclass,
 * 		in order to match "normal" class functions more closely.
 * 3. All "static" properties on superclass are copied shallowly from
 * 		superclass to subclass during createSubclass. This allows static
 * 		properties to be "inherited" as well, although things get confusing
 * 		quickly if you try to modify these properties (but then again,
 * 		mutable static properties are dangerous for other reasons as well,
 * 		so probably best to avoid modifying them anyway).
 * 
 * One "static" property is exposed on AbstractClass: createSubclass. Usage is
 * like this:
 * 
 * var Subclass = AbstractClass.createSubclass( optionalConstructorFunction );
 * 
 * Subclass.prototype.foo = function(){ console.log("foo"); }
 * var subclassInstance = new Subclass();
 * subclassInstance.foo();
 * 
 * var SubSubclass = Subclass.createSubclass( optionalConstructorFunction );
 * 
 * SubSubclass.prototype.bar = function() { console.log("bar"); }
 * var subsubclassInstance = new SubSubclass();
 * subsubclassInstance.foo();
 * subsubclassInstance.bar();
 */
angular
.module("beryllium")
.service("AbstractClass", [
	function() {
		return AbstractClass;
	}
]);

function AbstractClass() {

}

// Create a subclass of this class. If a constructor function is passed to
// this function, it will be turned into the subclass and returned, otherwise
// an empty function will be created, subclass-ified, and returned.
// 
// Note that the returned subclass will also have a createSubclass function,
// so that subclasses of the returned subclass can also be created, and so on.
AbstractClass.createSubclass = function( constructor ) {
	var superclass = this;

	var subclass = constructor || function() { };
	subclass.prototype = Object.create( superclass.prototype );
	subclass.prototype.constructor = subclass;

	Object.keys( this ).forEach( function(key) {
		subclass[key] = superclass[key];
	});

	return subclass;
};


})();
(function() {

/**
 * AbstractDataProvider service
 * 
 * Returns the AbstractDataProvider function, which is a subclass of
 * AbstractClass. See AbstractClass for more details.
 * 
 * AbstractDataProvider provides a uniform interface for loading data.  The
 * public API of a DataProvider is as follows:
 * 
 * dataProvider.dataReady: an instance of Cesium.Event that interested parties
 * 		can use to be notified when new data is ready. See:
 * 		https://cesiumjs.org/Cesium/Build/Documentation/Event.html
 * 
 * dataProvider.requestReload: a function that takes 0 arguments and requests
 * 		that new data be loaded. This is typically only called during app
 * 		startup or when a Requirements provider's requirements have changed
 * 		(if the instance supports Requirements)
 * 
 * Since AbstractDataProvider is an "abstract" class, it cannot be instantiated
 * directly. In order to obtain an instance you must instantiate a subclass of
 * AbstractDataProvider that implements the makeRequest method. The method takes
 * in 0 parameters and must return an Angular promise that will resolve when
 * the requested data becomes available.
 * 
 * As hinted at in the requestReload description, a DataProvider will often need
 * to gather parameters before it can request data. If that is necessary, the
 * recommended way to implement that is for the subclass to expose an instance
 * of RequirementsManager as `instance.requirementsManager`, and for the subclass's
 * implementation of makeRequest to contain a call to
 * `instance.requirementsManager.gatherRequirements()`. This returns an instance of
 * Requirements which is a convenience class for accessing varied requirements from
 * multiple sources. See RequirementsManager for more details, like how to 
 * register a requirements provider.
 */
angular
.module('beryllium')
.service('AbstractDataProvider', [
	'AbstractClass',
	function( AbstractClass ) {

		var AbstractDataProvider = AbstractClass.createSubclass(function() {
			AbstractClass.apply( this );
			var provider = this;

			provider.dataReady = new Cesium.Event();

			var currentRequest;
			var loadData = function() {
				if( currentRequest ) {
					if( currentRequest.abort ) {
						currentRequest.abort();
					}
					currentRequest = null;
				}

				var promise = provider.makeRequest();

				// Check for common errors in the subclass implementation
				if( !promise || !promise.then ) {
					throw new Error('Programmer Error: makeRequest must return a promise object');
				}

				promise.then(function( data ) {
					currentRequest = null;
					provider.dataReady.raiseEvent( data );
				});
				currentRequest = promise;
			};

			var loadDataTimeout;
			var loadDataDebounced = function() {
				if( loadDataTimeout ) {
					clearTimeout( loadDataTimeout );
				}
				loadDataTimeout = setTimeout(
					function() {
						loadDataTimeout = null;
						loadData();
					},
					0
				);
			}

			provider.requestReload = loadDataDebounced;
		});

		// Abstract method: must be implemented by the subclass
		// Return an Angular promise that will be resolved when the request is complete.
		// If it is necessary to gather Requirements from dependant objects, it
		// is up to the subclass to maintain and invoke a RequirementsManager.
		AbstractDataProvider.prototype.makeRequest = function() {
			throw new Error('Programmer Error: makeRequest must be implemented by an appropriate subclass');
		};

		return AbstractDataProvider;
	}
]);

})();
(function() {

/**
 * AbstractDataTransformer service
 * 
 * Service returns the AbstractDataTransformer function, which is a subclass
 * of AbstractClass. See AbstractClass for more details.
 * 
 * AbstractDataTransformer implements the same public API as AbstractDataProvider,
 * but instead of requesting data it transforms data from an AbstractDataProvider
 * or another AbstractDataTransformer. This is often useful because it allows
 * developers to encapsulate the request logic from the logic that actually manipulates
 * the data. It can also encapsulate multiple steps in the data manipulation
 * process by chaining together several DataTransformers.
 * 
 * For reference, the public API of AbstractDataProvider which AbstractDataTransformer
 * also implements is:
 * 
 * dataTransformer.dataReady: an instance of Cesium.Event that interested parties
 * 		can use to be notified when new data is ready. See:
 * 		https://cesiumjs.org/Cesium/Build/Documentation/Event.html
 * 
 * dataTransformer.requestReload: a function that takes 0 arguments and requests
 * 		that new data be loaded. This is typically only called during app
 * 		startup or when a Requirements provider's requirements have changed
 * 		(if the instance supports Requirements)
 * 
 * Similar to the AbstractDataProvider, the AbstractDataTransformer may need to 
 * proxy parameters to the parent data provider, or it may need parameters to
 * inform its own transformation processes. Either way the recommended way to do
 * this is by exposing a RequirementsManager as
 * `dataTransformer.requirementsManager`. The subclass instance may then gather
 * the necessary requirements by calling
 * `dataTransformer.requirementsManager.gatherRequirements()`. See RequirementsManager
 * for more details, like how to register a requirements provider.
 */
angular
.module("beryllium")
.service("AbstractDataTransformer", [
	"AbstractClass",
	function( AbstractClass ) {
		
		// AbstractDataTransformer constructor function.
		// Constructor requires one parameters; an instance of AbstractDataProvider
		// that it can bind this instance to.
		var AbstractDataTransformer = AbstractClass.createSubclass(function( dataProvider ) {
			if( !dataProvider ) {
				throw new Error("Programmer Error: 'dataProvider' is a required parameter for a DataTransformer constructor");
			}
			AbstractClass.apply( this );
			var transformer = this;
			
			dataProvider.dataReady.addEventListener(function( data ) {
				var transformedData = transformer.transformData( data );
				transformer.dataReady.raiseEvent( transformedData );
			});

			this.dataReady = new Cesium.Event();

			this.requestReload = function() {
				// Just pass the request up the chain until it reaches some class
				// that can actually request new data
				dataProvider.requestReload();
			};
		});

		// abstract method: This must be implemented by the subclass. 
		// Given raw data from the DataProvider,
		// return an object containing Cesium.Property instances, or other values that
		// are useful to the dependent dataReady listeners
		// 
		// Many subclasses will want to start their implementations with a call to
		// this.gatherRequirements(), but they are not required to.
		AbstractDataTransformer.prototype.transformData = function( data ) {
			throw new Error('Programmer Error: transformData must be implemented by an appropriate subclass');
		};

		return AbstractDataTransformer;
	}
]);

})();

(function() {

/**
 * asyncCompression service
 *
 * Service provides a way to use the LZString compression
 * and decompression algorithms asynchronously thanks to
 * web workers.
 *
 * compress(value) and decompress(value): Call compressionMaster
 * with the correct input. These are simple methods for external
 * developers to call while also providing compressionMaster as a
 * single function to make changes.
 *
 * compressSync(value) and decompressSync(value): synchronous versions
 * of their corresponding functions.
 *
 * compressionMaster(func, funcName, value): internal function that does
 * all the asynchronous compression and decompression using web workers.
 * If the browser does not support web workers, simply call the LZString
 * equivalent. Note that this returns a promise. There is a function
 * that can extract a function name from a function, but it's not
 * supported by older browsers. For the sake of compatibility we'll have
 * to stick with explicitly specifying it as a string argument.
 *
 * logCompression(lengthBefore, lengthAfter): internal function used
 * to log (as in console.log, not logarithm) how much the compression
 * algorithm has compressed the given value.
 */

angular
.module('beryllium')
.service('asyncCompression', [
    '$q',
    'LZString',
    function( $q, LZString ) {
        return {
            compress: compress,
            compressSync: compressSync,
            decompress: decompress,
            decompressSync: decompressSync
        };

        function compress(value) {
            return compressionMaster(LZString.compress, "LZString.compress", value);
        }

        function compressSync(value) {
            return LZString.compress(value);
        }

        function decompress(value) {
            return compressionMaster(LZString.decompress, "LZString.decompress", value);
        }

        function decompressSync(value) {
            return LZString.decompress(value);
        }

        function compressionMaster(func, funcName, value) {
            // If you change this URL, also change it in bower.json
            var lzStringURL = "https://cdn.rawgit.com/pieroxy/lz-string/86c3934589b0931cec4421549ed714d693b6400e/libs/lz-string.js";

            return $q(function(resolve) {
                if (typeof Worker !== "undefined") { // If web workers are supported by the browser
                    // Web worker code that just compresses/decompresses the given value
                    var blob = new Blob([
                        "importScripts('" + lzStringURL + "');" +
                        "onmessage = function(event) { postMessage(" + funcName + "(event.data)) };"
                    ], {type: "text/javascript"});

                    var worker = new Worker(window.URL.createObjectURL(blob));

                    worker.addEventListener('message', function(event) {
                        // logCompression(value.length, event.data.length);
                        resolve(event.data); // resolves the compressed/decompressed value
                    });

                    worker.postMessage(value); // Passes the web worker the current value
                } else {
                    resolve(func(value));
                }
            });
        }

        function logCompression(lengthBefore, lengthAfter) {
            console.log("LZString compression: " + ((lengthBefore-lengthAfter) * 100 / lengthBefore).toFixed(0) + '%');
        }
    }
]);

})();
(function() {

/**
 * berylliumColors service
 * 
 * Service provides utilities for working with colors in Cesium. The following things
 * are provided:
 * 
 * berylliumColors.MISSING_VALUE_COLOR: default color to use for missing data points
 * 
 * berylliumColors.interpolate( x, min, max, colors ): Interpolate a value to a color,
 * 		based on a color scheme.
 * 		x: the value to be interpolated
 * 		min, max: the range that 'x' lives inside. If 'x<=min' it will be interpolated to
 * 			the first color in the color range. If 'x>=max' it will be interpolated to
 * 			the last color in the range. Otherwise, it will be linearly interpolated between
 * 			the first and last colors based on how it falls between min and max
 * 		colors: the color range to use. Should probably be a reference to a color range from
 * 			berylliumColors, such as berylliumColors.DEFAULT
 * 
 * berylliumColors.INFERNO: A 'perceptually uniform' colormap from black to yellow through
 * 		purple and red. Copied from Matplotlib's 'inferno' colormap:
 * 		http://matplotlib.org/examples/color/colormaps_reference.html
 * 
 * berylliumColors.PLASMA: A 'perceptually uniform' colormap from purple to yellow through
 * 		red. Similar to INFERNO, but doesn't use black as the lowest color (can be hard to
 * 		see if your background is space). Copied from Matplotlib's 'plasma' colormap:
 * 		http://matplotlib.org/examples/color/colormaps_reference.html
 * 
 * berylliumColors.DEFAULT: The default colormap for berylliumColors. Currently set to PLASMA
 * 
 * Instructions for ripping colormaps from matplotlib. Requires Python and a recent enough
 * version of Matplotlib to have the desired colormap:
 * 
 * >>> import matplotlib.pyplot as plt
 * >>> import json
 * >>> cmap = plt.get_cmap('plasma')
 * >>> colors = [cmap(x) for x in range(0,256)]
 * >>> json.dumps( colors )
 */

var INFERNO = [
	[0.001462, 0.000466, 0.013866, 1.0],
	[0.0022669999999999999, 0.0012700000000000001, 0.01857, 1.0],
	[0.0032989999999999998, 0.0022490000000000001, 0.024239, 1.0],
	[0.0045469999999999998, 0.003392, 0.030908999999999999, 1.0],
	[0.0060060000000000001, 0.004692, 0.038558000000000002, 1.0],
	[0.0076759999999999997, 0.006136, 0.046836000000000003, 1.0],
	[0.0095610000000000001, 0.0077130000000000002, 0.055142999999999998, 1.0],
	[0.011663, 0.009417, 0.063460000000000003, 1.0],
	[0.013995, 0.011225000000000001, 0.071861999999999995, 1.0],
	[0.016560999999999999, 0.013136, 0.080282000000000006, 1.0],
	[0.019373000000000001, 0.015133000000000001, 0.088766999999999999, 1.0],
	[0.022447000000000002, 0.017198999999999999, 0.097326999999999997, 1.0],
	[0.025793, 0.019331000000000001, 0.10593, 1.0],
	[0.029432, 0.021503000000000001, 0.114621, 1.0],
	[0.033384999999999998, 0.023702000000000001, 0.12339700000000001, 1.0],
	[0.037668, 0.025921, 0.13223199999999999, 1.0],
	[0.042252999999999999, 0.028139000000000001, 0.14114099999999999, 1.0],
	[0.046914999999999998, 0.030324, 0.15016399999999999, 1.0],
	[0.051644000000000002, 0.032474000000000003, 0.15925400000000001, 1.0],
	[0.056448999999999999, 0.034569000000000003, 0.16841400000000001, 1.0],
	[0.061339999999999999, 0.036589999999999998, 0.17764199999999999, 1.0],
	[0.066331000000000001, 0.038503999999999997, 0.18696199999999999, 1.0],
	[0.071429000000000006, 0.040294000000000003, 0.196354, 1.0],
	[0.076636999999999997, 0.041904999999999998, 0.20579900000000001, 1.0],
	[0.081961999999999993, 0.043327999999999998, 0.21528900000000001, 1.0],
	[0.087411000000000003, 0.044555999999999998, 0.22481300000000001, 1.0],
	[0.092990000000000003, 0.045582999999999999, 0.23435800000000001, 1.0],
	[0.098701999999999998, 0.046401999999999999, 0.24390400000000001, 1.0],
	[0.10455100000000001, 0.047008000000000001, 0.25342999999999999, 1.0],
	[0.110536, 0.047398999999999997, 0.26291199999999998, 1.0],
	[0.116656, 0.047573999999999998, 0.27232099999999998, 1.0],
	[0.122908, 0.047536000000000002, 0.28162399999999999, 1.0],
	[0.12928500000000001, 0.047293000000000002, 0.29078799999999999, 1.0],
	[0.13577800000000001, 0.046856000000000002, 0.29977599999999999, 1.0],
	[0.142378, 0.046241999999999998, 0.30855300000000002, 1.0],
	[0.14907300000000001, 0.045468000000000001, 0.31708500000000001, 1.0],
	[0.15584999999999999, 0.044559000000000001, 0.32533800000000002, 1.0],
	[0.162689, 0.043554000000000002, 0.33327699999999999, 1.0],
	[0.169575, 0.042488999999999999, 0.34087400000000001, 1.0],
	[0.17649300000000001, 0.041402000000000001, 0.348111, 1.0],
	[0.18342900000000001, 0.040328999999999997, 0.35497099999999998, 1.0],
	[0.19036700000000001, 0.039308999999999997, 0.36144700000000002, 1.0],
	[0.197297, 0.038399999999999997, 0.367535, 1.0],
	[0.204209, 0.037631999999999999, 0.37323800000000001, 1.0],
	[0.211095, 0.03703, 0.37856299999999998, 1.0],
	[0.217949, 0.036615000000000002, 0.38352199999999997, 1.0],
	[0.22476299999999999, 0.036405, 0.388129, 1.0],
	[0.23153799999999999, 0.036405, 0.39240000000000003, 1.0],
	[0.23827300000000001, 0.036621000000000001, 0.39635300000000001, 1.0],
	[0.24496699999999999, 0.037054999999999998, 0.400007, 1.0],
	[0.25162000000000001, 0.037705000000000002, 0.40337800000000001, 1.0],
	[0.25823400000000002, 0.038571000000000001, 0.40648499999999999, 1.0],
	[0.26480999999999999, 0.039647000000000002, 0.40934500000000001, 1.0],
	[0.271347, 0.040922, 0.41197600000000001, 1.0],
	[0.27784999999999999, 0.042353000000000002, 0.41439199999999998, 1.0],
	[0.28432099999999999, 0.043933, 0.41660799999999998, 1.0],
	[0.29076299999999999, 0.045643999999999997, 0.41863699999999998, 1.0],
	[0.297178, 0.047469999999999998, 0.420491, 1.0],
	[0.303568, 0.049396000000000002, 0.422182, 1.0],
	[0.30993500000000002, 0.051407000000000001, 0.42372100000000001, 1.0],
	[0.31628200000000001, 0.053490000000000003, 0.42511599999999999, 1.0],
	[0.32261000000000001, 0.055634000000000003, 0.42637700000000001, 1.0],
	[0.32892100000000002, 0.057827000000000003, 0.42751099999999997, 1.0],
	[0.33521699999999999, 0.060060000000000002, 0.42852400000000002, 1.0],
	[0.34150000000000003, 0.062324999999999998, 0.429425, 1.0],
	[0.347771, 0.064616000000000007, 0.43021700000000002, 1.0],
	[0.35403200000000001, 0.066924999999999998, 0.43090600000000001, 1.0],
	[0.36028399999999999, 0.069247000000000003, 0.43149700000000002, 1.0],
	[0.36652899999999999, 0.071579000000000004, 0.43199399999999999, 1.0],
	[0.37276799999999999, 0.073914999999999995, 0.43240000000000001, 1.0],
	[0.37900099999999998, 0.076253000000000001, 0.43271900000000002, 1.0],
	[0.38522800000000001, 0.078590999999999994, 0.43295499999999998, 1.0],
	[0.391453, 0.080926999999999999, 0.43310900000000002, 1.0],
	[0.39767400000000003, 0.083256999999999998, 0.43318299999999998, 1.0],
	[0.40389399999999998, 0.085580000000000003, 0.43317899999999998, 1.0],
	[0.41011300000000001, 0.087896000000000002, 0.43309799999999998, 1.0],
	[0.41633100000000001, 0.090203000000000005, 0.43294300000000002, 1.0],
	[0.42254900000000001, 0.092501, 0.43271399999999999, 1.0],
	[0.42876799999999998, 0.094789999999999999, 0.43241200000000002, 1.0],
	[0.43498700000000001, 0.097069000000000003, 0.43203900000000001, 1.0],
	[0.44120700000000002, 0.099337999999999996, 0.43159399999999998, 1.0],
	[0.44742799999999999, 0.10159700000000001, 0.43108000000000002, 1.0],
	[0.45365100000000003, 0.103848, 0.43049799999999999, 1.0],
	[0.45987499999999998, 0.106089, 0.42984600000000001, 1.0],
	[0.46610000000000001, 0.108322, 0.42912499999999998, 1.0],
	[0.47232800000000003, 0.11054700000000001, 0.42833399999999999, 1.0],
	[0.47855799999999998, 0.112764, 0.42747499999999999, 1.0],
	[0.48478900000000003, 0.11497400000000001, 0.42654799999999998, 1.0],
	[0.49102200000000001, 0.11717900000000001, 0.42555199999999999, 1.0],
	[0.497257, 0.119379, 0.42448799999999998, 1.0],
	[0.50349299999999997, 0.121575, 0.42335600000000001, 1.0],
	[0.50973000000000002, 0.123769, 0.42215599999999998, 1.0],
	[0.51596699999999995, 0.12595999999999999, 0.42088700000000001, 1.0],
	[0.52220599999999995, 0.12814999999999999, 0.41954900000000001, 1.0],
	[0.52844400000000002, 0.13034100000000001, 0.41814200000000001, 1.0],
	[0.53468300000000002, 0.13253400000000001, 0.41666700000000001, 1.0],
	[0.54091999999999996, 0.13472899999999999, 0.41512300000000002, 1.0],
	[0.547157, 0.136929, 0.41351100000000002, 1.0],
	[0.553392, 0.13913400000000001, 0.411829, 1.0],
	[0.55962400000000001, 0.141346, 0.410078, 1.0],
	[0.56585399999999997, 0.143567, 0.40825800000000001, 1.0],
	[0.57208099999999995, 0.14579700000000001, 0.40636899999999998, 1.0],
	[0.57830400000000004, 0.148039, 0.40441100000000002, 1.0],
	[0.58452099999999996, 0.15029400000000001, 0.40238499999999999, 1.0],
	[0.59073399999999998, 0.152563, 0.40028999999999998, 1.0],
	[0.59694000000000003, 0.15484800000000001, 0.39812500000000001, 1.0],
	[0.60313899999999998, 0.15715100000000001, 0.39589099999999999, 1.0],
	[0.60933000000000004, 0.159474, 0.39358900000000002, 1.0],
	[0.61551299999999998, 0.16181699999999999, 0.39121899999999998, 1.0],
	[0.62168500000000004, 0.164184, 0.38878099999999999, 1.0],
	[0.62784700000000004, 0.166575, 0.38627600000000001, 1.0],
	[0.63399799999999995, 0.168992, 0.38370399999999999, 1.0],
	[0.64013500000000001, 0.17143800000000001, 0.38106499999999999, 1.0],
	[0.64625999999999995, 0.17391400000000001, 0.378359, 1.0],
	[0.65236899999999998, 0.17642099999999999, 0.37558599999999998, 1.0],
	[0.65846300000000002, 0.17896200000000001, 0.37274800000000002, 1.0],
	[0.66454000000000002, 0.18153900000000001, 0.36984600000000001, 1.0],
	[0.67059899999999995, 0.18415300000000001, 0.36687900000000001, 1.0],
	[0.67663799999999996, 0.186807, 0.36384899999999998, 1.0],
	[0.68265600000000004, 0.189501, 0.36075699999999999, 1.0],
	[0.68865299999999996, 0.19223899999999999, 0.357603, 1.0],
	[0.69462699999999999, 0.195021, 0.35438799999999998, 1.0],
	[0.70057599999999998, 0.197851, 0.35111300000000001, 1.0],
	[0.70650000000000002, 0.20072799999999999, 0.347777, 1.0],
	[0.71239600000000003, 0.203656, 0.34438299999999999, 1.0],
	[0.71826400000000001, 0.20663599999999999, 0.34093099999999998, 1.0],
	[0.72410300000000005, 0.20967, 0.337424, 1.0],
	[0.72990900000000003, 0.212759, 0.33386100000000002, 1.0],
	[0.73568299999999998, 0.21590599999999999, 0.33024500000000001, 1.0],
	[0.74142300000000005, 0.219112, 0.32657599999999998, 1.0],
	[0.74712699999999999, 0.22237799999999999, 0.32285599999999998, 1.0],
	[0.75279399999999996, 0.22570599999999999, 0.31908500000000001, 1.0],
	[0.75842200000000004, 0.229097, 0.31526599999999999, 1.0],
	[0.76400999999999997, 0.23255400000000001, 0.31139899999999998, 1.0],
	[0.76955600000000002, 0.23607700000000001, 0.30748500000000001, 1.0],
	[0.77505900000000005, 0.23966699999999999, 0.30352600000000002, 1.0],
	[0.78051700000000002, 0.24332699999999999, 0.29952299999999998, 1.0],
	[0.78592899999999999, 0.247056, 0.29547699999999999, 1.0],
	[0.79129300000000002, 0.25085600000000002, 0.29138999999999998, 1.0],
	[0.79660699999999995, 0.25472800000000001, 0.28726400000000002, 1.0],
	[0.801871, 0.25867400000000002, 0.28309899999999999, 1.0],
	[0.80708199999999997, 0.26269199999999998, 0.27889799999999998, 1.0],
	[0.81223900000000004, 0.26678600000000002, 0.27466099999999999, 1.0],
	[0.81734099999999998, 0.27095399999999997, 0.27039000000000002, 1.0],
	[0.82238599999999995, 0.27519700000000002, 0.26608500000000002, 1.0],
	[0.827372, 0.27951700000000002, 0.26174999999999998, 1.0],
	[0.83229900000000001, 0.28391300000000003, 0.25738299999999997, 1.0],
	[0.83716500000000005, 0.288385, 0.25298799999999999, 1.0],
	[0.84196899999999997, 0.292933, 0.24856400000000001, 1.0],
	[0.84670900000000004, 0.29755900000000002, 0.244113, 1.0],
	[0.85138400000000003, 0.30225999999999997, 0.23963599999999999, 1.0],
	[0.85599199999999998, 0.30703799999999998, 0.23513300000000001, 1.0],
	[0.86053299999999999, 0.311892, 0.23060600000000001, 1.0],
	[0.86500600000000005, 0.31682199999999999, 0.22605500000000001, 1.0],
	[0.86940899999999999, 0.32182699999999997, 0.22148200000000001, 1.0],
	[0.87374099999999999, 0.32690599999999997, 0.216886, 1.0],
	[0.87800100000000003, 0.33206000000000002, 0.21226800000000001, 1.0],
	[0.88218799999999997, 0.337287, 0.20762800000000001, 1.0],
	[0.88630200000000003, 0.342586, 0.20296800000000001, 1.0],
	[0.89034100000000005, 0.34795700000000002, 0.19828599999999999, 1.0],
	[0.89430500000000002, 0.35339900000000002, 0.19358400000000001, 1.0],
	[0.89819199999999999, 0.35891099999999998, 0.18886, 1.0],
	[0.902003, 0.36449199999999998, 0.184116, 1.0],
	[0.90573499999999996, 0.37014000000000002, 0.17935000000000001, 1.0],
	[0.90939000000000003, 0.37585600000000002, 0.174563, 1.0],
	[0.91296600000000006, 0.38163599999999998, 0.16975499999999999, 1.0],
	[0.916462, 0.38748100000000002, 0.16492399999999999, 1.0],
	[0.919879, 0.39338899999999999, 0.16006999999999999, 1.0],
	[0.92321500000000001, 0.39935900000000002, 0.155193, 1.0],
	[0.92647000000000002, 0.405389, 0.15029200000000001, 1.0],
	[0.92964400000000003, 0.41147899999999998, 0.145367, 1.0],
	[0.93273700000000004, 0.41762700000000003, 0.14041699999999999, 1.0],
	[0.935747, 0.42383100000000001, 0.13544, 1.0],
	[0.93867500000000004, 0.430091, 0.130438, 1.0],
	[0.94152100000000005, 0.43640499999999999, 0.12540899999999999, 1.0],
	[0.94428500000000004, 0.442772, 0.120354, 1.0],
	[0.94696499999999995, 0.44919100000000001, 0.115272, 1.0],
	[0.94956200000000002, 0.45566000000000001, 0.110164, 1.0],
	[0.952075, 0.46217799999999998, 0.105031, 1.0],
	[0.95450599999999997, 0.46874399999999999, 0.099874000000000004, 1.0],
	[0.95685200000000004, 0.475356, 0.094695000000000001, 1.0],
	[0.95911400000000002, 0.482014, 0.089498999999999995, 1.0],
	[0.96129299999999995, 0.48871599999999998, 0.084289000000000003, 1.0],
	[0.96338699999999999, 0.49546200000000001, 0.079073000000000004, 1.0],
	[0.96539699999999995, 0.50224899999999995, 0.073858999999999994, 1.0],
	[0.96732200000000002, 0.50907800000000003, 0.068658999999999998, 1.0],
	[0.969163, 0.51594600000000002, 0.063488000000000003, 1.0],
	[0.97091899999999998, 0.52285300000000001, 0.058367000000000002, 1.0],
	[0.97258999999999995, 0.52979799999999999, 0.053324000000000003, 1.0],
	[0.97417600000000004, 0.53678000000000003, 0.048391999999999998, 1.0],
	[0.97567700000000002, 0.543798, 0.043617999999999997, 1.0],
	[0.97709199999999996, 0.55084999999999995, 0.039050000000000001, 1.0],
	[0.97842200000000001, 0.55793700000000002, 0.034930999999999997, 1.0],
	[0.97966600000000004, 0.56505700000000003, 0.031408999999999999, 1.0],
	[0.98082400000000003, 0.57220899999999997, 0.028507999999999999, 1.0],
	[0.98189499999999996, 0.57939200000000002, 0.026249999999999999, 1.0],
	[0.982881, 0.58660599999999996, 0.024660999999999999, 1.0],
	[0.98377899999999996, 0.59384899999999996, 0.023769999999999999, 1.0],
	[0.98459099999999999, 0.60112200000000005, 0.023605999999999999, 1.0],
	[0.98531500000000005, 0.60842200000000002, 0.024202000000000001, 1.0],
	[0.98595200000000005, 0.61575000000000002, 0.025592, 1.0],
	[0.98650199999999999, 0.62310500000000002, 0.027813999999999998, 1.0],
	[0.98696399999999995, 0.63048499999999996, 0.030908000000000001, 1.0],
	[0.98733700000000002, 0.63788999999999996, 0.034916000000000003, 1.0],
	[0.987622, 0.64532, 0.039885999999999998, 1.0],
	[0.987819, 0.65277300000000005, 0.045581000000000003, 1.0],
	[0.98792599999999997, 0.66025, 0.051749999999999997, 1.0],
	[0.98794499999999996, 0.66774800000000001, 0.058328999999999999, 1.0],
	[0.98787400000000003, 0.67526699999999995, 0.065256999999999996, 1.0],
	[0.98771399999999998, 0.68280700000000005, 0.072488999999999998, 1.0],
	[0.98746400000000001, 0.69036600000000004, 0.079990000000000006, 1.0],
	[0.987124, 0.69794400000000001, 0.087731000000000003, 1.0],
	[0.98669399999999996, 0.70553999999999994, 0.095694000000000001, 1.0],
	[0.98617500000000002, 0.71315300000000004, 0.103863, 1.0],
	[0.98556600000000005, 0.72078200000000003, 0.112229, 1.0],
	[0.98486499999999999, 0.72842700000000005, 0.120785, 1.0],
	[0.98407500000000003, 0.73608700000000005, 0.129527, 1.0],
	[0.98319599999999996, 0.74375800000000003, 0.13845299999999999, 1.0],
	[0.98222799999999999, 0.75144200000000005, 0.147565, 1.0],
	[0.98117299999999996, 0.759135, 0.156863, 1.0],
	[0.98003200000000001, 0.76683699999999999, 0.166353, 1.0],
	[0.97880599999999995, 0.77454500000000004, 0.176037, 1.0],
	[0.97749699999999995, 0.78225800000000001, 0.185923, 1.0],
	[0.97610799999999998, 0.78997399999999995, 0.196018, 1.0],
	[0.974638, 0.79769199999999996, 0.20633199999999999, 1.0],
	[0.97308799999999995, 0.80540900000000004, 0.21687699999999999, 1.0],
	[0.971468, 0.81312200000000001, 0.227658, 1.0],
	[0.96978299999999995, 0.82082500000000003, 0.23868600000000001, 1.0],
	[0.96804100000000004, 0.828515, 0.249972, 1.0],
	[0.96624299999999996, 0.83619100000000002, 0.26153399999999999, 1.0],
	[0.96439399999999997, 0.84384800000000004, 0.273391, 1.0],
	[0.96251699999999996, 0.85147600000000001, 0.28554600000000002, 1.0],
	[0.96062599999999998, 0.85906899999999997, 0.29801, 1.0],
	[0.95872000000000002, 0.86662399999999995, 0.31081999999999999, 1.0],
	[0.95683399999999996, 0.87412900000000004, 0.32397399999999998, 1.0],
	[0.95499699999999998, 0.88156900000000005, 0.33747500000000002, 1.0],
	[0.95321500000000003, 0.88894200000000001, 0.35136899999999999, 1.0],
	[0.951546, 0.89622599999999997, 0.36562699999999998, 1.0],
	[0.95001800000000003, 0.90340900000000002, 0.38027100000000003, 1.0],
	[0.94868300000000005, 0.91047299999999998, 0.395289, 1.0],
	[0.94759400000000005, 0.91739899999999996, 0.410665, 1.0],
	[0.94680900000000001, 0.92416799999999999, 0.426373, 1.0],
	[0.94639200000000001, 0.93076099999999995, 0.44236700000000001, 1.0],
	[0.94640299999999999, 0.93715899999999996, 0.458592, 1.0],
	[0.94690300000000005, 0.94334799999999996, 0.47497, 1.0],
	[0.94793700000000003, 0.949318, 0.49142599999999997, 1.0],
	[0.94954499999999997, 0.955063, 0.50785999999999998, 1.0],
	[0.95174000000000003, 0.96058699999999997, 0.52420299999999997, 1.0],
	[0.95452899999999996, 0.96589599999999998, 0.54036099999999998, 1.0],
	[0.95789599999999997, 0.97100299999999995, 0.55627499999999996, 1.0],
	[0.961812, 0.97592400000000001, 0.57192500000000002, 1.0],
	[0.96624900000000002, 0.98067800000000005, 0.58720600000000001, 1.0],
	[0.97116199999999997, 0.98528199999999999, 0.60215399999999997, 1.0],
	[0.97651100000000002, 0.98975299999999999, 0.61675999999999997, 1.0],
	[0.98225700000000005, 0.99410900000000002, 0.63101700000000005, 1.0],
	[0.98836199999999996, 0.99836400000000003, 0.64492400000000005, 1.0]
];

var PLASMA = [
	[0.050382999999999997, 0.029803, 0.52797499999999997, 1.0],
	[0.063535999999999995, 0.028426, 0.53312400000000004, 1.0],
	[0.075353000000000003, 0.027206000000000001, 0.53800700000000001, 1.0],
	[0.086221999999999993, 0.026124999999999999, 0.54265799999999997, 1.0],
	[0.096379000000000006, 0.025165, 0.54710300000000001, 1.0],
	[0.10598, 0.024309000000000001, 0.55136799999999997, 1.0],
	[0.115124, 0.023556000000000001, 0.55546799999999996, 1.0],
	[0.123903, 0.022877999999999999, 0.559423, 1.0],
	[0.132381, 0.022258, 0.56325000000000003, 1.0],
	[0.14060300000000001, 0.021687000000000001, 0.56695899999999999, 1.0],
	[0.14860699999999999, 0.021153999999999999, 0.57056200000000001, 1.0],
	[0.156421, 0.020650999999999999, 0.57406500000000005, 1.0],
	[0.16406999999999999, 0.020171000000000001, 0.57747800000000005, 1.0],
	[0.171574, 0.019706000000000001, 0.58080600000000004, 1.0],
	[0.17895, 0.019251999999999998, 0.58405399999999996, 1.0],
	[0.18621299999999999, 0.018803, 0.58722799999999997, 1.0],
	[0.19337399999999999, 0.018353999999999999, 0.59033000000000002, 1.0],
	[0.20044500000000001, 0.017902000000000001, 0.593364, 1.0],
	[0.20743500000000001, 0.017441999999999999, 0.596333, 1.0],
	[0.21435000000000001, 0.016972999999999999, 0.59923899999999997, 1.0],
	[0.221197, 0.016497000000000001, 0.60208300000000003, 1.0],
	[0.22798299999999999, 0.016007, 0.60486700000000004, 1.0],
	[0.23471500000000001, 0.015502, 0.60759200000000002, 1.0],
	[0.241396, 0.014978999999999999, 0.610259, 1.0],
	[0.248032, 0.014439, 0.61286799999999997, 1.0],
	[0.25462699999999999, 0.013882, 0.61541900000000005, 1.0],
	[0.261183, 0.013308, 0.61791099999999999, 1.0],
	[0.26770300000000002, 0.012716, 0.62034599999999995, 1.0],
	[0.27419100000000002, 0.012109, 0.622722, 1.0],
	[0.28064800000000001, 0.011488, 0.62503799999999998, 1.0],
	[0.287076, 0.010855, 0.62729500000000005, 1.0],
	[0.29347800000000002, 0.010213, 0.62948999999999999, 1.0],
	[0.29985499999999998, 0.0095610000000000001, 0.63162399999999996, 1.0],
	[0.30620999999999998, 0.0089020000000000002, 0.63369399999999998, 1.0],
	[0.31254300000000002, 0.0082389999999999998, 0.63570000000000004, 1.0],
	[0.31885599999999997, 0.0075760000000000003, 0.63763999999999998, 1.0],
	[0.32514999999999999, 0.0069150000000000001, 0.63951199999999997, 1.0],
	[0.331426, 0.0062610000000000001, 0.641316, 1.0],
	[0.33768300000000001, 0.0056179999999999997, 0.64304899999999998, 1.0],
	[0.34392499999999998, 0.0049909999999999998, 0.64471000000000001, 1.0],
	[0.35015000000000002, 0.0043819999999999996, 0.64629800000000004, 1.0],
	[0.35635899999999998, 0.0037980000000000002, 0.64781, 1.0],
	[0.36255300000000001, 0.0032429999999999998, 0.64924499999999996, 1.0],
	[0.36873299999999998, 0.0027239999999999999, 0.65060099999999998, 1.0],
	[0.37489699999999998, 0.002245, 0.65187600000000001, 1.0],
	[0.38104700000000002, 0.0018140000000000001, 0.65306799999999998, 1.0],
	[0.387183, 0.0014339999999999999, 0.65417700000000001, 1.0],
	[0.39330399999999999, 0.001114, 0.65519899999999998, 1.0],
	[0.39941100000000002, 0.00085899999999999995, 0.65613299999999997, 1.0],
	[0.405503, 0.000678, 0.65697700000000003, 1.0],
	[0.41158, 0.00057700000000000004, 0.65773000000000004, 1.0],
	[0.41764200000000001, 0.00056400000000000005, 0.65839000000000003, 1.0],
	[0.42368899999999998, 0.00064599999999999998, 0.65895599999999999, 1.0],
	[0.42971900000000002, 0.00083100000000000003, 0.65942500000000004, 1.0],
	[0.43573400000000001, 0.001127, 0.65979699999999997, 1.0],
	[0.44173200000000001, 0.0015399999999999999, 0.66006900000000002, 1.0],
	[0.447714, 0.0020799999999999998, 0.66024000000000005, 1.0],
	[0.453677, 0.0027550000000000001, 0.66030999999999995, 1.0],
	[0.459623, 0.0035739999999999999, 0.660277, 1.0],
	[0.46555000000000002, 0.0045450000000000004, 0.66013900000000003, 1.0],
	[0.47145700000000001, 0.0056779999999999999, 0.65989699999999996, 1.0],
	[0.47734399999999999, 0.0069800000000000001, 0.65954900000000005, 1.0],
	[0.48320999999999997, 0.0084600000000000005, 0.65909499999999999, 1.0],
	[0.48905500000000002, 0.010127000000000001, 0.65853399999999995, 1.0],
	[0.49487700000000001, 0.011990000000000001, 0.65786500000000003, 1.0],
	[0.50067799999999996, 0.014055, 0.65708800000000001, 1.0],
	[0.50645399999999996, 0.016333, 0.65620199999999995, 1.0],
	[0.51220600000000005, 0.018832999999999999, 0.65520900000000004, 1.0],
	[0.51793299999999998, 0.021562999999999999, 0.65410900000000005, 1.0],
	[0.52363300000000002, 0.024532000000000002, 0.65290099999999995, 1.0],
	[0.52930600000000005, 0.027747000000000001, 0.651586, 1.0],
	[0.53495199999999998, 0.031217000000000002, 0.65016499999999999, 1.0],
	[0.54056999999999999, 0.034950000000000002, 0.64863999999999999, 1.0],
	[0.546157, 0.038954000000000003, 0.64700999999999997, 1.0],
	[0.55171499999999996, 0.043136000000000001, 0.64527699999999999, 1.0],
	[0.55724300000000004, 0.047330999999999998, 0.64344299999999999, 1.0],
	[0.56273799999999996, 0.051545000000000001, 0.641509, 1.0],
	[0.56820099999999996, 0.055778000000000001, 0.63947699999999996, 1.0],
	[0.57363200000000003, 0.060027999999999998, 0.63734900000000005, 1.0],
	[0.57902900000000002, 0.064296000000000006, 0.63512599999999997, 1.0],
	[0.58439099999999999, 0.068579000000000001, 0.63281200000000004, 1.0],
	[0.58971899999999999, 0.072877999999999998, 0.63040799999999997, 1.0],
	[0.59501099999999996, 0.077189999999999995, 0.62791699999999995, 1.0],
	[0.60026599999999997, 0.081516000000000005, 0.62534199999999995, 1.0],
	[0.60548500000000005, 0.085854, 0.62268599999999996, 1.0],
	[0.61066699999999996, 0.090204000000000006, 0.61995100000000003, 1.0],
	[0.61581200000000003, 0.094563999999999995, 0.61714000000000002, 1.0],
	[0.620919, 0.098933999999999994, 0.61425700000000005, 1.0],
	[0.62598699999999996, 0.103312, 0.61130499999999999, 1.0],
	[0.63101700000000005, 0.107699, 0.60828700000000002, 1.0],
	[0.63600800000000002, 0.112092, 0.60520499999999999, 1.0],
	[0.64095899999999995, 0.116492, 0.60206499999999996, 1.0],
	[0.645872, 0.12089800000000001, 0.59886700000000004, 1.0],
	[0.65074600000000005, 0.125309, 0.59561699999999995, 1.0],
	[0.65558000000000005, 0.12972500000000001, 0.59231699999999998, 1.0],
	[0.66037400000000002, 0.13414400000000001, 0.58897100000000002, 1.0],
	[0.66512899999999997, 0.13856599999999999, 0.58558200000000005, 1.0],
	[0.66984500000000002, 0.14299200000000001, 0.58215399999999995, 1.0],
	[0.67452199999999995, 0.14741899999999999, 0.57868799999999998, 1.0],
	[0.67915999999999999, 0.15184800000000001, 0.57518899999999995, 1.0],
	[0.68375799999999998, 0.156278, 0.57165999999999995, 1.0],
	[0.68831799999999999, 0.16070899999999999, 0.56810300000000002, 1.0],
	[0.69284000000000001, 0.16514100000000001, 0.56452199999999997, 1.0],
	[0.69732400000000005, 0.169573, 0.56091899999999995, 1.0],
	[0.70176899999999998, 0.17400499999999999, 0.55729600000000001, 1.0],
	[0.70617799999999997, 0.17843700000000001, 0.55365699999999995, 1.0],
	[0.71054899999999999, 0.182868, 0.55000400000000005, 1.0],
	[0.71488300000000005, 0.18729899999999999, 0.54633799999999999, 1.0],
	[0.71918099999999996, 0.19172900000000001, 0.54266300000000001, 1.0],
	[0.72344399999999998, 0.196158, 0.53898100000000004, 1.0],
	[0.72767000000000004, 0.20058599999999999, 0.53529300000000002, 1.0],
	[0.73186200000000001, 0.205013, 0.53160099999999999, 1.0],
	[0.73601899999999998, 0.20943899999999999, 0.52790800000000004, 1.0],
	[0.740143, 0.213864, 0.52421600000000002, 1.0],
	[0.744232, 0.21828800000000001, 0.52052399999999999, 1.0],
	[0.74828899999999998, 0.22271099999999999, 0.51683400000000002, 1.0],
	[0.75231199999999998, 0.227133, 0.51314899999999997, 1.0],
	[0.75630399999999998, 0.23155500000000001, 0.50946800000000003, 1.0],
	[0.76026400000000005, 0.23597599999999999, 0.50579399999999997, 1.0],
	[0.76419300000000001, 0.240396, 0.50212599999999996, 1.0],
	[0.76809000000000005, 0.24481700000000001, 0.49846499999999999, 1.0],
	[0.77195800000000003, 0.24923699999999999, 0.494813, 1.0],
	[0.77579600000000004, 0.25365799999999999, 0.49117100000000002, 1.0],
	[0.77960399999999996, 0.25807799999999997, 0.487539, 1.0],
	[0.78338300000000005, 0.26250000000000001, 0.48391800000000001, 1.0],
	[0.78713299999999997, 0.26692199999999999, 0.48030699999999998, 1.0],
	[0.79085499999999997, 0.271345, 0.47670600000000002, 1.0],
	[0.79454899999999995, 0.27577000000000002, 0.47311700000000001, 1.0],
	[0.79821600000000004, 0.28019699999999997, 0.46953800000000001, 1.0],
	[0.80185499999999998, 0.28462599999999999, 0.46597100000000002, 1.0],
	[0.80546700000000004, 0.28905700000000001, 0.46241500000000002, 1.0],
	[0.80905199999999999, 0.293491, 0.45887, 1.0],
	[0.812612, 0.29792800000000003, 0.45533800000000002, 1.0],
	[0.81614399999999998, 0.30236800000000003, 0.451816, 1.0],
	[0.81965100000000002, 0.30681199999999997, 0.44830599999999998, 1.0],
	[0.82313199999999997, 0.31126100000000001, 0.44480599999999998, 1.0],
	[0.82658799999999999, 0.31571399999999999, 0.44131599999999999, 1.0],
	[0.83001800000000003, 0.32017200000000001, 0.437836, 1.0],
	[0.833422, 0.32463500000000001, 0.43436599999999997, 1.0],
	[0.83680100000000002, 0.32910499999999998, 0.43090499999999998, 1.0],
	[0.84015499999999999, 0.33357999999999999, 0.42745499999999997, 1.0],
	[0.84348400000000001, 0.33806199999999997, 0.42401299999999997, 1.0],
	[0.84678799999999999, 0.34255099999999999, 0.42057899999999998, 1.0],
	[0.85006599999999999, 0.34704800000000002, 0.417153, 1.0],
	[0.85331900000000005, 0.351553, 0.41373399999999999, 1.0],
	[0.85654699999999995, 0.35606599999999999, 0.41032200000000002, 1.0],
	[0.85975000000000001, 0.36058800000000002, 0.40691699999999997, 1.0],
	[0.862927, 0.36511900000000003, 0.40351900000000002, 1.0],
	[0.86607800000000001, 0.36965999999999999, 0.40012599999999998, 1.0],
	[0.86920299999999995, 0.37421199999999999, 0.39673799999999998, 1.0],
	[0.87230300000000005, 0.378774, 0.39335500000000001, 1.0],
	[0.87537600000000004, 0.38334699999999999, 0.38997599999999999, 1.0],
	[0.87842299999999995, 0.387932, 0.3866, 1.0],
	[0.88144299999999998, 0.39252900000000002, 0.38322899999999999, 1.0],
	[0.884436, 0.39713900000000002, 0.37985999999999998, 1.0],
	[0.88740200000000002, 0.40176200000000001, 0.376494, 1.0],
	[0.89034000000000002, 0.40639799999999998, 0.37313000000000002, 1.0],
	[0.89324999999999999, 0.41104800000000002, 0.36976799999999999, 1.0],
	[0.89613100000000001, 0.41571200000000003, 0.36640699999999998, 1.0],
	[0.89898400000000001, 0.42039199999999999, 0.36304700000000001, 1.0],
	[0.90180700000000003, 0.42508699999999999, 0.35968800000000001, 1.0],
	[0.90460099999999999, 0.42979699999999998, 0.35632900000000001, 1.0],
	[0.90736499999999998, 0.43452400000000002, 0.35297000000000001, 1.0],
	[0.91009799999999996, 0.43926799999999999, 0.34960999999999998, 1.0],
	[0.91279999999999994, 0.44402900000000001, 0.34625099999999998, 1.0],
	[0.91547100000000003, 0.44880700000000001, 0.34288999999999997, 1.0],
	[0.91810899999999995, 0.45360299999999998, 0.33952900000000003, 1.0],
	[0.92071400000000003, 0.45841700000000002, 0.33616600000000002, 1.0],
	[0.92328699999999997, 0.46325100000000002, 0.33280100000000001, 1.0],
	[0.92582500000000001, 0.46810299999999999, 0.32943499999999998, 1.0],
	[0.92832899999999996, 0.47297499999999998, 0.326067, 1.0],
	[0.93079800000000001, 0.47786699999999999, 0.32269700000000001, 1.0],
	[0.93323199999999995, 0.48277999999999999, 0.31932500000000003, 1.0],
	[0.93562999999999996, 0.48771199999999998, 0.31595200000000001, 1.0],
	[0.93798999999999999, 0.49266700000000002, 0.31257499999999999, 1.0],
	[0.94031299999999995, 0.49764199999999997, 0.309197, 1.0],
	[0.94259800000000005, 0.50263899999999995, 0.30581599999999998, 1.0],
	[0.94484400000000002, 0.50765800000000005, 0.30243300000000001, 1.0],
	[0.94705099999999998, 0.51269900000000002, 0.29904900000000001, 1.0],
	[0.94921699999999998, 0.51776299999999997, 0.29566199999999998, 1.0],
	[0.95134399999999997, 0.52285000000000004, 0.29227500000000001, 1.0],
	[0.95342800000000005, 0.52795999999999998, 0.288883, 1.0],
	[0.95547000000000004, 0.53309300000000004, 0.28549000000000002, 1.0],
	[0.95746900000000001, 0.53825000000000001, 0.28209600000000001, 1.0],
	[0.95942400000000005, 0.543431, 0.27870099999999998, 1.0],
	[0.96133599999999997, 0.54863600000000001, 0.27530500000000002, 1.0],
	[0.96320300000000003, 0.55386500000000005, 0.27190900000000001, 1.0],
	[0.96502399999999999, 0.559118, 0.268513, 1.0],
	[0.96679800000000005, 0.56439600000000001, 0.26511800000000002, 1.0],
	[0.968526, 0.56969999999999998, 0.26172099999999998, 1.0],
	[0.97020499999999998, 0.57502799999999998, 0.25832500000000003, 1.0],
	[0.971835, 0.58038199999999995, 0.25493100000000002, 1.0],
	[0.97341599999999995, 0.58576099999999998, 0.25153999999999999, 1.0],
	[0.97494700000000001, 0.59116500000000005, 0.24815100000000001, 1.0],
	[0.97642799999999996, 0.59659499999999999, 0.24476700000000001, 1.0],
	[0.97785599999999995, 0.602051, 0.24138699999999999, 1.0],
	[0.97923300000000002, 0.60753199999999996, 0.238013, 1.0],
	[0.98055599999999998, 0.613039, 0.23464599999999999, 1.0],
	[0.98182599999999998, 0.61857200000000001, 0.23128699999999999, 1.0],
	[0.98304100000000005, 0.62413099999999999, 0.227937, 1.0],
	[0.98419900000000005, 0.629718, 0.22459499999999999, 1.0],
	[0.98530099999999998, 0.63532999999999995, 0.22126499999999999, 1.0],
	[0.98634500000000003, 0.64096900000000001, 0.217948, 1.0],
	[0.98733199999999999, 0.64663300000000001, 0.21464800000000001, 1.0],
	[0.98826000000000003, 0.65232500000000004, 0.211364, 1.0],
	[0.98912800000000001, 0.65804300000000004, 0.20810000000000001, 1.0],
	[0.98993500000000001, 0.66378700000000002, 0.20485900000000001, 1.0],
	[0.99068100000000003, 0.66955799999999999, 0.20164199999999999, 1.0],
	[0.99136500000000005, 0.67535500000000004, 0.19845299999999999, 1.0],
	[0.99198500000000001, 0.68117899999999998, 0.195295, 1.0],
	[0.99254100000000001, 0.68703000000000003, 0.19217000000000001, 1.0],
	[0.99303200000000003, 0.69290700000000005, 0.189084, 1.0],
	[0.99345600000000001, 0.69881000000000004, 0.18604100000000001, 1.0],
	[0.99381399999999998, 0.70474099999999995, 0.18304300000000001, 1.0],
	[0.99410299999999996, 0.71069800000000005, 0.18009700000000001, 1.0],
	[0.99432399999999999, 0.71668100000000001, 0.177208, 1.0],
	[0.99447399999999997, 0.72269099999999997, 0.17438100000000001, 1.0],
	[0.99455300000000002, 0.72872800000000004, 0.171622, 1.0],
	[0.99456100000000003, 0.73479099999999997, 0.168938, 1.0],
	[0.99449500000000002, 0.74087999999999998, 0.16633500000000001, 1.0],
	[0.99435499999999999, 0.74699499999999996, 0.16382099999999999, 1.0],
	[0.99414100000000005, 0.75313699999999995, 0.16140399999999999, 1.0],
	[0.99385100000000004, 0.75930399999999998, 0.15909200000000001, 1.0],
	[0.99348199999999998, 0.76549900000000004, 0.156891, 1.0],
	[0.99303300000000005, 0.77171999999999996, 0.154808, 1.0],
	[0.99250499999999997, 0.77796699999999996, 0.15285499999999999, 1.0],
	[0.99189700000000003, 0.78423900000000002, 0.15104200000000001, 1.0],
	[0.99120900000000001, 0.79053700000000005, 0.14937700000000001, 1.0],
	[0.99043899999999996, 0.79685899999999998, 0.14787, 1.0],
	[0.98958699999999999, 0.80320499999999995, 0.14652899999999999, 1.0],
	[0.98864799999999997, 0.80957900000000005, 0.14535699999999999, 1.0],
	[0.98762099999999997, 0.81597799999999998, 0.14436299999999999, 1.0],
	[0.98650899999999997, 0.82240100000000005, 0.14355699999999999, 1.0],
	[0.98531400000000002, 0.82884599999999997, 0.14294499999999999, 1.0],
	[0.98403099999999999, 0.83531500000000003, 0.14252799999999999, 1.0],
	[0.982653, 0.841812, 0.14230300000000001, 1.0],
	[0.98119000000000001, 0.848329, 0.14227899999999999, 1.0],
	[0.97964399999999996, 0.85486600000000001, 0.142453, 1.0],
	[0.97799499999999995, 0.86143199999999998, 0.14280799999999999, 1.0],
	[0.97626500000000005, 0.86801600000000001, 0.14335100000000001, 1.0],
	[0.97444299999999995, 0.87462200000000001, 0.14406099999999999, 1.0],
	[0.97253000000000001, 0.88124999999999998, 0.144923, 1.0],
	[0.97053299999999998, 0.88789600000000002, 0.14591899999999999, 1.0],
	[0.96844300000000005, 0.89456400000000003, 0.14701400000000001, 1.0],
	[0.96627099999999999, 0.90124899999999997, 0.14818000000000001, 1.0],
	[0.96402100000000002, 0.90795000000000003, 0.14937, 1.0],
	[0.96168100000000001, 0.91467200000000004, 0.15051999999999999, 1.0],
	[0.95927600000000002, 0.92140699999999998, 0.15156600000000001, 1.0],
	[0.95680799999999999, 0.92815199999999998, 0.15240899999999999, 1.0],
	[0.954287, 0.93490799999999996, 0.152921, 1.0],
	[0.95172599999999996, 0.94167100000000004, 0.15292500000000001, 1.0],
	[0.94915099999999997, 0.94843500000000003, 0.15217800000000001, 1.0],
	[0.94660200000000005, 0.95518999999999998, 0.15032799999999999, 1.0],
	[0.94415199999999999, 0.96191599999999999, 0.14686099999999999, 1.0],
	[0.94189599999999996, 0.96858999999999995, 0.140956, 1.0],
	[0.94001500000000004, 0.97515799999999997, 0.131326, 1.0]
];

var GRAY = Cesium.Color.GRAY.withAlpha(0.2);

function interpolate(x, min, max, colors) {

	if(
		typeof x === 'undefined' ||
		x === null ||
		isNaN(x)
	) {
		return GRAY;
	}

	// interpolate x to a value between 0 and 1
	// based on its position in the range min->max
	// (min interpolates to 0, max interpolates to 1)
	var val;
	if(x < min) { val = 0; }
	else if(x > max) { val = 1; }
	else {
		val = (x - min) / (max - min);
	}

	var index = val * (colors.length-1);
	var isInt = index % 1 === 0;
	if( isInt ) {
		var match = colors[index];
		return new Cesium.Color(
			match[0], // red
			match[1], // green
			match[2], // blue
			match[3]  // alpha
		);
	}

	var indexBefore = Math.floor(index);
	var indexAfter = Math.ceil(index);

	var valBefore = indexBefore / colors.length;
	var valAfter = indexAfter / colors.length;

	var breakpointBefore = colors[indexBefore];
	var breakpointAfter = colors[indexAfter];

	var red		= _interpolate(val, valBefore, valAfter, breakpointBefore[0], breakpointAfter[0]);
	var green	= _interpolate(val, valBefore, valAfter, breakpointBefore[1], breakpointAfter[1]);
	var blue	= _interpolate(val, valBefore, valAfter, breakpointBefore[2], breakpointAfter[2]);
	var alpha	= _interpolate(val, valBefore, valAfter, breakpointBefore[3], breakpointAfter[3]);

	return new Cesium.Color(red, green, blue, alpha);
}

function _interpolate(x, xMin, xMax, yMin, yMax) {
	var val = (x - xMin) / (xMax - xMin);
	return ((yMax - yMin) * val) + yMin;
}

function interpolateArray( array, colors ) {
	var min = Number.MAX_VALUE;
	var max = -Number.MAX_VALUE;
	for( var i=0; i<array.length; i++ ) {
		var val = array[i];
		if( val < min ) { min = val; }
		if( val > max ) { max = val; }
	}

	return array.map(function( val ) {
		return interpolate(val, min, max, colors);
	});
}

// Returns background gradient CSS given a color map (look above at INFERNO and PLASMA for format examples).
function colorMapToCSSBackground( colorMap ) {
	// Ignore undefined because it's possible for this method to be called before the color map is set
	if (typeof colorMap === "undefined") {
		return "";
	}

	var cssStringChunks = [];
	for (var i = 0; i < colorMap.length; i++) {
		cssPercentage = (i / colorMap.length) * 100;
		var r = Math.round(colorMap[i][0] * 255);
		var g = Math.round(colorMap[i][1] * 255);
		var b = Math.round(colorMap[i][2] * 255);

		cssStringChunks.push("rgba(" + r + ", " + g + ", " + b + ", " + colorMap[i][3] + ") " + cssPercentage + "%");
	}
	var cssString = cssStringChunks.join(", ");

	return {
		"background": "-moz-linear-gradient(left, " + cssString + ")",
		"background": "-webkit-linear-gradient(left, " + cssString + ")",
		"background": "-o-linear-gradient(left, " + cssString + ")",
		"background": "-ms-linear-gradient(left, " + cssString + ")",
		"background": "linear-gradient(to right, " + cssString + ")"
	};
}

angular
.module('beryllium')
.service('berylliumColors', [
	function() {
		return {
			DEFAULT: PLASMA,
			INFERNO: INFERNO,
			PLASMA: PLASMA,
			MISSING_VALUE_COLOR: GRAY,
			interpolate: interpolate,
			interpolateArray: interpolateArray,
            colorMapToCSSBackground: colorMapToCSSBackground
		}
	}
]);

})();

(function() {

// CallbackPositionProperty: A CallbackProperty that is also a PositionProperty
//
// This angular service is intended to be an implementation for what I consider to be
// a missing class in the Cesium API: a PositionProperty that can be calculated on
// the fly from a callback function.
// 
// There are similar classes such as ConstantPositionProperty which is described as
// a "ConstantProperty that is also a PositionProperty".
// 
// A PositionProperty is, in theory, just a Property that happens to return a Position
// object from its getValue(time) function. In practice, there is a little more to
// the API that you have to implement (see the Cesium docs for PositionProperty).
// I've implemented that API here as best I know how. Much of the code was copied
// from the code for ConstantPositionProperty and modified to work with a callback
// function. It was also "Angular-ified" so that it would fit better with our
// existing code, even though Cesium is not natively an Angular app.
angular
.module("beryllium")
.service( "CallbackPositionProperty", [
	function() {

		function CallbackPositionProperty( callback, isConstant, referenceFrame ) {
			this._callback = callback;
			this.isConstant = isConstant;
			this.referenceFrame = typeof referenceFrame === "undefined"
				? Cesium.ReferenceFrame.FIXED
				: referenceFrame;
			this.definitionChanged = new Cesium.Event();
		}

		CallbackPositionProperty.prototype = Object.create( Cesium.PositionProperty );

		CallbackPositionProperty.prototype.getValue = function( time, result ) {
			return this.getValueInReferenceFrame( time, Cesium.ReferenceFrame.FIXED, result );
		};

		CallbackPositionProperty.prototype.getValueInReferenceFrame = function( time, referenceFrame, result ) {
			result = this._callback( time, result );
			return Cesium.PositionProperty.convertToReferenceFrame(
				time,
				result,
				this.referenceFrame,
				referenceFrame,
				result
			);
		};

		return CallbackPositionProperty;

	}
]);

})();

(function() {
angular
.module("beryllium")
.service("errorMessageInterceptor", ['$q', function($q) {
    var service = this;

    this.request = function(config) {
        $('#connection-error-message').css('display', 'none');
        return config;
    };

    this.requestError = function(config) {
        $('#connection-error-message')
            .show()
            .css('display', 'block');
        return $q.reject(config);
    };

    this.response = function(response) {
        $('#connection-error-message').css('display', 'none');
        return response;
    };

    this.responseError = function(response) {
        if( response.status === -1 ) {
            // Per angular docs, "-1 usually means that the request was aborted".
            // In our case, we'll frequently abort requests if a new one is made in
            // its place; e.g. the user changes the date while the previous date is
            // still loading. That's not an error, so we should just ignore it.
            return;
        }

        $('#connection-error-message')
            .show()
            .css('display', 'block');
        return $q.reject(response);
    };
}])
})();
(function() {

angular.module('beryllium')
.service( 'icrfPreloader', [
	"$q",
	function( $q ) {
		return {
			preloadIcrf: preloadIcrf
		};

		function preloadIcrf(startTime, endTime) {
			var julianStart = Cesium.JulianDate.fromDate( startTime );
			var julianEnd = Cesium.JulianDate.fromDate( endTime );

			// Tell Cesium to preload ICRF transform data
			// for the appropriate time frame.
			// 
			// Note: icrfRequest is a Cesium promise, not compatible
			// with angular ($q) promises
			var icrfRequest = Cesium.Transforms.preloadIcrfFixed(
				new Cesium.TimeInterval({
					start: julianStart,
					end: julianEnd
				})
			);

			// This is a hacky but reliable way to tell whether or not the
			// ICRF data has finished loading. In theory you should be able
			// to use Cesium.when( icrfRequest, success, failure ) to wait
			// for the ICRF data to load, however I've had a lot of issues
			// where that didn't work as advertised. So, I've created my own
			// polling loop to test whether the data I need is available.
			// I created another promise (via $q) object that will not
			// resolve until the polling loop succeeds. It can be used in
			// conjunction with other $q promises, e.g. by combining into
			// a single promise via $q.all([ icrfPromise, otherPromise ])
			var icrfPromise = $q(function( resolve, reject ) {

				var toInertial = new Cesium.Matrix3();
				var startTime = new Date().getTime();
				var maxElapsedSec = 10;
				var pollInterval = 50;

				var testIcrfLoaded = function() {
					var now = Date.now();
					var elapsedSec = (now - startTime) / 1000;

					if( elapsedSec > maxElapsedSec ) {
						var msg = "Failed to load ICRF data";
						console.error( msg );
						reject( msg );
						return;
					}

					if(Cesium.defined(
						Cesium.Transforms.computeFixedToIcrfMatrix( julianStart, toInertial )
					))
					{
						resolve();
					}
					else {
						setTimeout(
							function() {
								try {
									testIcrfLoaded();
								}
								catch( e ) { console.error(e); }
							},
							pollInterval
						);
					}
				};

				try {
					testIcrfLoaded();
				}
				catch( e ) { console.error(e); }
			});

			return icrfPromise;
		}
	}
]);

})();


(function() {

/**
 * Latis service
 * 
 * Service returns the Latis constructor function. Provides a unified way to
 * make requests to a latis server.
 * 
 * GET requests are automatically cached in the browser using requestCacher.
 * See requestCacher for more details.
 * 
 * Currently only GET requests are supported, but POST support may be added
 * in the future (possibly without caching?)
 * 
 * Latis.prototype.get( dataset, outputType, selectionArray, filterArray ):
 * 		Makes a request to a latis server.
 * 		dataset: (String) the latis dataset to request
 * 		outputType: (String) the output type to request, e.g. "json" or "txt"
 * 		selectionArray: (Array<String>) the parameters to request from the latis server. Pass
 * 			an empty array to request all parameters.
 * 		filterArray: (Array<String>) an array of latis filters such as:
 * 			[ "time>=2016-01-01", "first()" ]
 */
angular
.module("beryllium")
.service("Latis", [
	"requestCacher",
	function( requestCacher ) {

		function Latis( latisBaseUrl ) {
			this.latisBaseUrl = latisBaseUrl;
		}

		Latis.prototype.getUrlExtension = function( dataset, outputType, selectionArray, filterArray ) {
			// Need to copy the filterArray to avoid making
			// changes to the actual filterArray below.
			var filterArrayCopy = filterArray.slice();

            // Join selection and add to filter array. It should come after all other
            // filters in case we're filtering on something that we're not selecting
            if( selectionArray && selectionArray.length ) {
                filterArrayCopy.push( selectionArray.join(",") );
            }

            return dataset + '.' + outputType + '?' +
                filterArrayCopy.join("&");
		};

		Latis.prototype.get = function( dataset, outputType, selectionArray, filterArray ) {

			var url = this.latisBaseUrl + this.getUrlExtension(dataset, outputType, selectionArray, filterArray);

			var basePromise = requestCacher.getUrl( url );

			var mappedPromise = basePromise.then(
				function( data ) {
					if( outputType === "jsond" ) {
						if( data.hasOwnProperty(dataset) ) {
							return data[dataset];
						}
						else {
							var keys = Object.keys(data);
							if( keys.length === 0 ) {
								throw new Error("No properties found on response object");
							}
							else if( keys.length > 1 ) {
								console.warn("Failed to find expected property '" + dataset + "' on response object. Found multiple properties on response object instead. Using first of [" + keys.join(", ") + "]");
								var key = keys[0];
								return data[ key ];
							}
							else {
								var key = keys[0];
								console.warn("Failed to find expected property '" + dataset + "' on response object. Using property '" + key + "' instead.");
								return data[ key ];
							}
						}
					}
					else {
						return data;
					}
				}
			);

			if( basePromise.abort ) {
				mappedPromise.abort = function() {
					basePromise.abort();
				};
			}

			return mappedPromise;
		};

		return Latis;
	}
]);

})();
(function() {

/**
 * requestCacher service
 * 
 * Service provides a mechanism to make GET requests that are automatically
 * cached by their urls. Currently uses sessionStorage as the cache store,
 * but may change in the future. Using sessionStorage means that the cache
 * will be cleared whenever the user closes their browser (as opposed to
 * localStorage which persists through browser restarts for a browser-specific
 * amount of time). If sessionStorage is not available (not all browsers
 * support it), then no caching will be performed.
 * 
 * Internally, the cacher uses compression from LZString to compress the
 * cache contents before storing them. This allows us to store much more
 * data (approx 5x more for standard JSON requests) but sometimes breaks
 * the debug tools in Chrome when you try to inspect sessionStorage. See
 * below for more details.
 * 
 * The cacher also uses a Least Recently Used (LRU) algorithm to clear
 * out older cache entries when a new entry fails to store correctly.
 * 
 * requestCacher.get( url ): If the given url is not found in the cache, make
 * 		a GET request for it. Otherwise, return whatever result is found in
 * 		the cache. Either way, returns a promise that resolves to the requested
 * 		data. If an actual GET request was made, the promise object will
 * 		have an abort() method that you can call to abort the request
 * 		(see the docs for angular's $http for more details)
 */
angular
.module('beryllium')
.service('requestCacher', [
	'$q',
	'$http',
	'asyncCompression',
	function( $q, $http, asyncCompression ) {

		// Enabling DO_COMPRESSION significantly increases the number
		// of items we can store in sessionStorage (by roughly 5x), but
		// it seems to break the Chrome debug tools if you try to view
		// the contents of sessionStorage (compressed strings use a lot
		// of unusual Unicode characters, apparently)
		// 
		// If you just need to clear the cache, run
		// sessionStorage.clear()
		// from the JS console (or any JS script).
		// 
		// If you accidentally freeze your Chrome and you want to
		// unfreeze it, close your browser (all tabs) and restart it.
		// Since we use sessionStorage instead of localStorage this will
		// clear the storage and allow the sessionStorage tab to
		// render correctly. However, you should quickly navigate away
		// from the sessionStorage tab before new values are added and
		// it freezes up again.
		// 
		// If you need to inspect the actual contents of sessionStorage,
		// set DO_COMPRESSION to false.
		// 
		// If you need to inspect the actual contents of sessionStorage
		// while it's compressed... good luck.
		var DO_COMPRESSION = true;

		var STORAGE_KEY_PREFIX = 'ajaxCache_';
		var LRU_KEY_PREFIX = 'ajaxCacheLRU_';

		// Attempt to populate 'storage' with window.sessionStorage. If
		// an error is encountered, leave it as null as a sign that caching
		// is not available.
		var storage = null;
		if( storageAvailable('sessionStorage') ) {
			storage = window.sessionStorage;
		}

		return {
			getUrl: getUrl
		};

		// Given a url, return a promise that will resolve to the contents
		// of that GET request. The contents may or may not come from the
		// cache, you shouldn't have to worry about it.
		function getUrl( url ) {

			var token = DO_COMPRESSION
				? asyncCompression.compressSync( url )
				: url;

			// storageKey will be used to store the actual result and
			// lruKey will be used to store an ISO 8601 token that
			// denotes how old that cache item is.
			var storageKey = STORAGE_KEY_PREFIX + token;
			var lruKey = LRU_KEY_PREFIX + token;

			// If storage is available, try to get the url from storage
			if( storage ) {
				var result = storage.getItem( storageKey );

				// If a result was found in storage, return a promise that
				// resolves to that result. Otherwise, continue on.
				if( result !== null ) {

					// Update the timestamp on this item
					storage.setItem( lruKey, new Date().toISOString() );

					// Return a promise that resolves to the un-compressed,
					// un-JSON-ed result from the cache
					return $q(function(resolve) {
						setTimeout(
							function() {
								if( DO_COMPRESSION ) {
									asyncCompression.decompress( result ).then(
										function( decompressedResult ) {
                                            resolve( JSON.parse( decompressedResult ) );
                                        }
									);
								} else {
                                    resolve( JSON.parse( result ) );
								}
							},
							0
						);
					});
				}
			}

			// Unable to get result from storage for whatever reason, so
			// make the GET request
			var canceler = $q.defer();
			var basePromise = $http({
				method: 'GET',
				url: url,
				timeout: canceler.promise
			});
			var httpPromise = basePromise.then(
				function( response ) {
					// By only returning the response data if it has an
					// successful http status code (aka a status code of 200-299),
					// it prevents it from caching unsuccessful get requests.
					if (response.status >= 200 && response.status < 300) {
						return response.data;
					}
					console.warn("Unsuccessful GET request");
					throw response;
				}
			);
			httpPromise.abort = function() {
				canceler.resolve();
			};

			// If storage is available, attempt to cache the result when
			// the request returns. Be sure not to overwrite the httpPromise
			// object, since we need to preserve its abort() function.
			if( storage ) {
				httpPromise.then( function( result ) {
					var keepTrying = true;
					var success = false;
					var error = null;

					// 1. Attempt to store the result in the cache
					// 2. If attempt fails, assume the cache is full
					// 		and remove the least recently used item
					//		from the cache.
					// 3. If nothing was removed from the cache (i.e.
					//		the cache is empty), give up and write
					//		an error message to the console. Do not
					//		throw; we can still resolve the promise
					//		with the data even if we weren't able to
					//		cache it.
					// 4. If something was removed from the cache,
					//		loop back to #1 and attempt to store
					//		result again
					while( !success && keepTrying ) {
						try {
							storeItem( storageKey, lruKey, result );
							success = true
						}
						catch (e) {
							error = e;
							keepTrying = removeLeastRecentlyUsed();
						}
					}

					// The only thing that I can think of that would cause this
					// is if the whole response is so big that it won't even fit
					// in the cache when the cache is empty. Typical caches are
					// about 5MB. However, most of our responses are JSON, and
					// JSON typically compresses by about 5x, so we'd have to
					// receive about 25mb of JSON before we would fail to cache
					// a single request. That's a friggin lot of JSON - there's
					// probably something else going wonky at that point.
					if( !success ) {
						console.warn("requestCacher storage insert failure: " + (error.message || error));
					}
				} );
			}

			return httpPromise;
		}

		// Simple function to test if sessionStorage/localStorage is available.
		// I saw this on StackOverflow originally, and modified it to suit my
		// needs. I didn't think to copy down the URL though.
		function storageAvailable(type) {
			try {
				var storage = window[type],
					x = '__storage_test__';
				storage.setItem(x, x);
				storage.removeItem(x);
				return true;
			}
			catch(e) {
				return false;
			}
		}

        // Wrapper method for storage.setItem that also handles
		// JSON stringification, compression and whatever else we
		// may decide is useful in the future
        function storeItem( storageKey, lruKey, value ) {
            value = JSON.stringify( value );

            var doStore = function( value ) {
                storage.setItem(
                    storageKey,
                    value
                );
                storage.setItem(
                    lruKey,
                    new Date().toISOString()
                );
            };

            if( DO_COMPRESSION ) {
                asyncCompression.compress( value ).then( doStore );
            } else {
                doStore( value );
            }
        }

		// Return a list of all keys living inside the storage object. This is surprisingly
		// a pain in the butt, so I wrapped it up in a helper method.
		function storageKeys() {
			var keys = [];
			var i = storage.length;
			while( i-- ) {
				keys.push( storage.key(i) );
			}
			return keys;
		}

		// Remove the least recently used item from the cache so that we can free up some
		// more space for new items. Return true if an item was successfully removed or
		// false if there were no more items to remove.
		function removeLeastRecentlyUsed() {
			var keys = storageKeys().filter(function(key) { return key.indexOf( LRU_KEY_PREFIX ) === 0; });
			if( keys.length === 0 ) {
				return false;
			}

			var timestamps = keys
				.map(
					function(key) { return new Date(storage.getItem(key)); }
				)
				.sort(
					function(a, b) { return a.getTime() - b.getTime(); }
				);
			var leastRecentlyUsedLRUKey = keys[0];
			var leastRecentlyUsedKey = STORAGE_KEY_PREFIX + leastRecentlyUsedLRUKey.substring( LRU_KEY_PREFIX.length );

			storage.removeItem( leastRecentlyUsedKey );
			storage.removeItem( leastRecentlyUsedLRUKey );
			return true;
		}
	}
]);

})();
(function() {

/**
 * RequirementsManager class
 * 
 * This service returns the RequirementsManager function which is intended to
 * be instantiated via `new RequirementsManager()`. The constructor takes 0
 * parameters. The class exposes the following API:
 * 
 * requirementsManager.addRequirementsProvider( providerFn, [context] ): Takes
 *      in a requirements provider function and an optional context. When requirements
 *      are requested via gatherRequirements() the providerFn will be called with
 *      0 parameters on the provided context (or on a null context, if none was provided).
 *      See below for more details about requirements provider functions.
 * 
 * requirementsManager.gatherRequirements(): Takes 0 parameters, gathers requirements
 *      from all registered requirements provider functions, and returns the consolidated
 *      result as a Requirements object.
 * 
 * A "requirements provider function" is a function that takes in 0 parameters and should
 * return an object or undefined. If the return value is undefined it will be ignored
 * completely and will not be accesible from the Requirements object returned from
 * gatherRequirements(). Otherwise, all of the returned objects will be stored inside
 * the returned Requirements object and will be easily queryable using methods on that
 * object. See the Requirements class for more details.
 */
angular
.module("beryllium")
.service("RequirementsManager", [
    "Requirements",
    function( Requirements ) {

        function RequirementsManager() {

            var requirementsProviderObjs = [];

            this.addRequirementsProvider = function( providerFn, context ) {
                requirementsProviderObjs.push({
                    providerFn: providerFn,
                    context: context || null
                });
            };

            this.gatherRequirements = function() {
                var requirementsArray = requirementsProviderObjs
                    .map(function( providerObj ) {
                        return providerObj.providerFn.call( providerObj.context );
                    })
                    .filter(function( requirementsObj ) {
                        // filter out: undefined, falsey values, and empty arrays
                        return (typeof requirementsObj !== "undefined") &&
                            (!!requirementsObj) &&
                            (!Array.isArray(requirementsObj) || requirementsObj.length > 0);
                    });
                return new Requirements( requirementsArray );
            }
        }

        return RequirementsManager;
    }
]);

})();
(function() {

/**
 * Requirements service
 * 
 * Service returns the Requirements function which is a subclass of
 * AbstractClass. See AbstractClass for more details.
 * 
 * An instance of Requirements is just a wrapper around an array
 * of objects, with some utility methods. The wrapped array is
 * stored as this.requirements
 * 
 * Requirements.prototype.findFirst( name, missingVal ):
 * 		Search through this.requirements for the first object that
 * 		returns true for hasOwnProperty(name) and then return
 * 		that object's 'name' property. If 'name' is not found
 * 		and missingVal was not passed (arguments.length == 1),
 * 		an Error will be thrown. If 'name' is not found and
 * 		missingVal was passed, no Error will be thrown and
 * 		missingVal will be returned instead.
 * 
 * Requirements.prototype.concatAll( name ): Search through
 * 		this.requirements for all objects that have a 'name'
 * 		property and concat together the results into an array.
 */
angular
.module("beryllium")
.service("Requirements", [
	"AbstractClass",
	function( AbstractClass ) {

		var Requirements = AbstractClass.createSubclass(function( requirementsArray ) {
			AbstractClass.call( this );
			this.requirements = requirementsArray;
		});

		// Search through this.requirements for the first object that
		// returns true for hasOwnProperty(name) and then return
		// that object's 'name' property. If 'name' is not found
		// and missingVal was not passed (arguments.length == 1),
		// an Error will be thrown. If 'name' is not found and
		// missingVal was passed, no Error will be thrown and
		// missingVal will be returned instead.
		Requirements.prototype.findFirst = function( name, missingVal ) {
			for( var i=0; i<this.requirements.length; i++ ) {
				var requirementsObj = this.requirements[i];
				if( requirementsObj.hasOwnProperty(name) ) {
					return requirementsObj[name];
				}
			}

			if( arguments.length > 1 ) {
				return missingVal;
			}
			else {
				throw new Error("Developer Error: unable to find requirement '" + name + "'");
			}
		};

		// Search through
		// this.requirements for all objects that have a 'name'
		// property and concat together the results into an array.
		Requirements.prototype.concatAll = function( name ) {
			return this.requirements.reduce(
				function( arr, requirementsObj ) {
					if( requirementsObj.hasOwnProperty(name) ) {
						return arr.concat( requirementsObj[name] );
					}
					else {
						return arr;
					}
				},
				[]
			);
		}

		return Requirements;
	}
]);

})();
(function() {

angular
.module("beryllium")
.service("webGl", [
	function() {
		return {
			isWebGlAvailable: isWebGlAvailable
		}
	}
]);

function isWebGlAvailable() {
	// Source: https://developer.mozilla.org/en-US/Learn/WebGL/By_example/Detect_WebGL
	var canvas = document.createElement("canvas");
	var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
	var success = gl && (gl instanceof WebGLRenderingContext);
	return success;
}

})();

angular.module('beryllium').run(['$templateCache', function($templateCache) {$templateCache.put('components/cesiumComponent/cesium.component.html','<div id="cesium-container" class="split split-horizontal"><md-sidenav class="md-sidenav-left" md-is-open="$ctrl.sidenavOpen" md-disable-backdrop=""><md-content><section><h3 class="md-toolbar-tools" id="sidenav-header" layout="row">Controls</h3><md-button id="sidenav-close-btn" ng-click="$ctrl.sidenavOpen = !$ctrl.sidenavOpen">&#10006;</md-button></section><div ng-transclude="sideNavContent"></div></md-content></md-sidenav><div class="be-cesium-container" ng-class="{ \'sidenav-open\': $ctrl.sidenavOpen }"><div id="{{$ctrl.cesiumElId}}" class="be-cesium-render-target"></div><div class="alert alert-danger alert-dismissible" id="connection-error-message"><button class="close" onclick="$(\'#connection-error-message\').hide()">&times;</button> <strong>Error!</strong> Could not connect to the server.</div><div id="loading-indicator" loading-icon=""><md-progress-circular md-mode="indeterminate"></md-progress-circular></div><md-button id="sidenav-button" ng-click="$ctrl.sidenavOpen = !$ctrl.sidenavOpen">{{$ctrl.sidenavOpen ? "Hide" : "Show"}} Controls</md-button><md-button id="plot-pane-button" ng-click="$ctrl.togglePaneWidths()">{{$ctrl.plotPaneOpen ? "Hide" : "Show"}} Plots</md-button><div id="legend-container"><div ng-transclude="legendContent" ng-show="$ctrl.legendOpen"></div><md-button id="legend-button" ng-click="$ctrl.legendOpen = !$ctrl.legendOpen">{{$ctrl.legendOpen ? "Hide" : "Show"}} Legend</md-button></div><div ng-transclude="" class="be-transclude-container"></div></div></div><div id="highstock-container" class="split split-horizontal"><div ng-transclude="highstockPaneContent"></div></div>');
$templateCache.put('components/dateRangePickerComponent/dateRangePicker.component.html','<md-content layout="column" class="datepicker-parent"><p><label>Available Dates:</label> <span class="nowrap"><span>{{ $ctrl.availableMinDate | date : \'yyyy-MM-dd\' : \'UTC\' }}</span> &ndash; <span>{{ $ctrl.availableMaxDate | date : \'yyyy-MM-dd\' : \'UTC\' }}</span></span></p><md-input-container class="md-block"><label>Start time (UTC)</label><md-icon class="clickable" md-svg-src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTkgM2gtMVYxaC0ydjJIOFYxSDZ2Mkg1Yy0xLjExIDAtMS45OS45LTEuOTkgMkwzIDE5YzAgMS4xLjg5IDIgMiAyaDE0YzEuMSAwIDItLjkgMi0yVjVjMC0xLjEtLjktMi0yLTJ6bTAgMTZINVY4aDE0djExek03IDEwaDV2NUg3eiIvPjwvc3ZnPg==" aria-hidden="true" ng-click="$ctrl.openMin()"></md-icon><input type="text" uib-datepicker-popup="{{$ctrl.format}}" ng-model="$ctrl.displayMinDate" ng-click="$ctrl.openMin()" ng-focus="$ctrl.openMin()" is-open="$ctrl.minDateOpened" datepicker-options="$ctrl.datepickerOptions"><ng-messages for="$ctrl.errorObj" role="alert" md-auto-hide="false"><div ng-message="startTooEarly">Start time cannot be before {{ $ctrl.availableMinDate | date : \'yyyy-MM-dd\' : \'UTC\' }}</div></ng-messages></md-input-container><md-input-container class="md-block"><label>End time (UTC)</label><md-icon class="clickable" md-svg-src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTkgM2gtMVYxaC0ydjJIOFYxSDZ2Mkg1Yy0xLjExIDAtMS45OS45LTEuOTkgMkwzIDE5YzAgMS4xLjg5IDIgMiAyaDE0YzEuMSAwIDItLjkgMi0yVjVjMC0xLjEtLjktMi0yLTJ6bTAgMTZINVY4aDE0djExek03IDEwaDV2NUg3eiIvPjwvc3ZnPg==" aria-hidden="true" ng-click="$ctrl.openMax()"></md-icon><input type="text" uib-datepicker-popup="{{$ctrl.format}}" ng-model="$ctrl.displayMaxDate" ng-click="$ctrl.openMax()" ng-focus="$ctrl.openMax()" is-open="$ctrl.maxDateOpened" datepicker-options="$ctrl.datepickerOptions"><ng-messages for="$ctrl.errorObj" role="alert" md-auto-hide="false"><div ng-message="endBeforeStart">The end time must be after the start time</div><div ng-message="endTooLate">End time cannot be after {{ $ctrl.availableMaxDate | date : \'yyyy-MM-dd\' : \'UTC\' }}</div><div ng-message="rangeTooLarge">You cannot request more than 24 hours of data.</div></ng-messages></md-input-container><div><md-button class="md-raised md-primary" ng-disabled="!$ctrl.displayMinDate || !$ctrl.displayMaxDate" ng-click="$ctrl.reloadClicked()">Reload</md-button></div></md-content>');
$templateCache.put('components/singleDatePickerComponent/singleDatePicker.component.html','<md-content layout="column" class="datepicker-parent"><p><label>Available Dates:</label> <span class="nowrap"><span>{{ $ctrl.availableMinDate | date : \'yyyy-MM-dd\' : \'UTC\' }}</span> &ndash; <span>{{ $ctrl.availableMaxDate | date : \'yyyy-MM-dd\' : \'UTC\' }}</span></span></p><md-input-container class="md-block"><label>Date (UTC)</label><md-icon class="clickable" md-svg-src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTkgM2gtMVYxaC0ydjJIOFYxSDZ2Mkg1Yy0xLjExIDAtMS45OS45LTEuOTkgMkwzIDE5YzAgMS4xLjg5IDIgMiAyaDE0YzEuMSAwIDItLjkgMi0yVjVjMC0xLjEtLjktMi0yLTJ6bTAgMTZINVY4aDE0djExek03IDEwaDV2NUg3eiIvPjwvc3ZnPg==" aria-hidden="true" ng-click="$ctrl.openDate()"></md-icon><input type="text" uib-datepicker-popup="{{$ctrl.format}}" ng-model="$ctrl.date" ng-click="$ctrl.openDate()" ng-focus="$ctrl.openDate()" is-open="$ctrl.dateOpened" datepicker-options="$ctrl.datepickerOptions" ng-model-options="{timezone: \'utc\'}"><ng-messages for="$ctrl.errorObj" role="alert" md-auto-hide="false"><div ng-message="tooEarly">Date cannot be before {{ $ctrl.availableMinDate | date : \'yyyy-MM-dd\' : \'UTC\' }}</div><div ng-message="tooLate">Date cannot be after {{ $ctrl.availableMaxDate | date : \'yyyy-MM-dd\' : \'UTC\' }}</div></ng-messages></md-input-container><div><md-button class="md-raised md-primary" ng-disabled="!$ctrl.date" ng-click="$ctrl.reloadClicked()">Reload</md-button></div></md-content>');
$templateCache.put('components/webGlErrorComponent/webGlError.component.html','<div id="error-box"><h1>Unsupported Browser (WebGL Missing)</h1><p>Sorry! We can\'t display this page in your browser because WebGL is either missing or disabled.</p><p>In order to properly render our 3D Mars Maven visualization, we require a 3D rendering technology called <a href="https://en.wikipedia.org/wiki/WebGL" target="blank">WebGL</a>. Most modern browsers support this technology, but unfortunately not all of them. Browser support may also vary depending on the operating system and available hardware; for example, Chrome may support WebGL on x86/64 Windows and OSX, but may not on certain distributions of Linux or on certain hardware architectures such as ARM or SPARC. Some browsers may also require a physical graphics card in order to properly support WebGL.</p><p>We recommend trying to load this page in a different browser, or even a different machine.</p><p>You can check if your browser supports WebGL by visiting <a href="https://get.webgl.org/">Get WebGL</a>. If you can see a spinning cube, yet are unable to load this visualization, please let us know!</p></div>');}]);