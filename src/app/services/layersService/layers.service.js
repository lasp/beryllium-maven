(function() {

/**
 * layers service
 *
 * Create several Mars-specific imagery layers and
 * terrain layers for Cesium to use.
 *
 * imageryViewModels: array of ProviderViewModel instances. Available
 *         instances are "Viking", "MOLA", and "MOLA-SR".
 * terrainViewModels: array of ProviderViewModel instances. Available
 *         instances are "MARSIAU2000"
 * get( key ): returns an instance of imageryViewModels by name
 * getTerrain( key ): returns an instance of terrainViewModels by name
 */
angular
.module('beryllium-maven')
.service('layers', [
    'maven3dConstants',
    function( constants ) {

        var IMAGERY_SERVER ='https://lasp.colorado.edu/media/projects/tms_trees/';

        var imageryViewModels = [

            new Cesium.ProviderViewModel({
                name: 'Viking',
                iconUrl: 'img/VikingThumb.png',
                tooltip: 'Viking true-ish color (http://www.mars.asu.edu/data/mdim_color/)',
                creationFunction: function() {
                    return Cesium.createTileMapServiceImageryProvider({
                        url: IMAGERY_SERVER + 'mars-viking',
                        fileExtension: 'png',
                        minimumLevel: 0,
                        maximumLevel: 5,
                        flipXY: true
                    });
                }
            }),

            new Cesium.ProviderViewModel({
                name: 'MOLA',
                iconUrl: 'img/MolaThumb.png',
                tooltip: 'MOLA Color Height Map (http://www.mars.asu.edu/data/mdim_color/)',
                creationFunction: function() {
                    return Cesium.createTileMapServiceImageryProvider({
                        url: IMAGERY_SERVER + 'mars-mola',
                        fileExtension: 'png',
                        minimumLevel: 0,
                        maximumLevel: 7,
                        flipXY: true
                    });
                }
            }),

            new Cesium.ProviderViewModel({
                name: 'MOLA-SR',
                iconUrl: 'img/MolaSrThumb.png',
                tooltip: 'MOLA Shaded Relief Map (http://www.mars.asu.edu/data/molasr/)',
                creationFunction: function() {
                    return Cesium.createTileMapServiceImageryProvider({
                        url: IMAGERY_SERVER + 'mars-mola-sr',
                        fileExtension: 'png',
                        minimumLevel: 0,
                        maximumLevel: 5,
                        flipXY: true
                    });
                }
            })
        ];

        var terrainViewModels = [
            new Cesium.ProviderViewModel({
                name: "MARSIAU2000",
                tooltip: "Mars IAU 2000",
                iconUrl: "img/Ellipsoid.png",
                creationFunction: function() {
                    return new Cesium.EllipsoidTerrainProvider({ ellipsoid: constants.MARSIAU2000 });
                }
            })
        ];

        var layerLookup = {};
        imageryViewModels.forEach( function( viewModel ) {
            layerLookup[viewModel.name] = viewModel;
        });

        var terrainLookup = {};
        terrainViewModels.forEach( function( viewModel ) {
            terrainLookup[viewModel.name] = viewModel;
        });

        return {
            imageryViewModels: imageryViewModels,
            terrainViewModels: terrainViewModels,
            get: function( key ) {
                return layerLookup[key];
            },
            getTerrain: function( key ) {
                return terrainLookup[key];
            }
        }


    }
]);

})();
