(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
function corslite(url, callback, cors) {
    var sent = false;

    if (typeof window.XMLHttpRequest === 'undefined') {
        return callback(Error('Browser not supported'));
    }

    if (typeof cors === 'undefined') {
        var m = url.match(/^\s*https?:\/\/[^\/]*/);
        cors = m && (m[0] !== location.protocol + '//' + location.domain +
                (location.port ? ':' + location.port : ''));
    }

    var x = new window.XMLHttpRequest();

    function isSuccessful(status) {
        return status >= 200 && status < 300 || status === 304;
    }

    if (cors && !('withCredentials' in x)) {
        // IE8-9
        x = new window.XDomainRequest();

        // Ensure callback is never called synchronously, i.e., before
        // x.send() returns (this has been observed in the wild).
        // See https://github.com/mapbox/mapbox.js/issues/472
        var original = callback;
        callback = function() {
            if (sent) {
                original.apply(this, arguments);
            } else {
                var that = this, args = arguments;
                setTimeout(function() {
                    original.apply(that, args);
                }, 0);
            }
        }
    }

    function loaded() {
        if (
            // XDomainRequest
            x.status === undefined ||
            // modern browsers
            isSuccessful(x.status)) callback.call(x, null, x);
        else callback.call(x, x, null);
    }

    // Both `onreadystatechange` and `onload` can fire. `onreadystatechange`
    // has [been supported for longer](http://stackoverflow.com/a/9181508/229001).
    if ('onload' in x) {
        x.onload = loaded;
    } else {
        x.onreadystatechange = function readystate() {
            if (x.readyState === 4) {
                loaded();
            }
        };
    }

    // Call the callback with the XMLHttpRequest object as an error and prevent
    // it from ever being called again by reassigning it to `noop`
    x.onerror = function error(evt) {
        // XDomainRequest provides no evt parameter
        callback.call(this, evt || true, null);
        callback = function() { };
    };

    // IE9 must have onprogress be set to a unique function.
    x.onprogress = function() { };

    x.ontimeout = function(evt) {
        callback.call(this, evt, null);
        callback = function() { };
    };

    x.onabort = function(evt) {
        callback.call(this, evt, null);
        callback = function() { };
    };

    // GET is the only supported HTTP Verb by XDomainRequest and is the
    // only one supported here.
    x.open('GET', url, true);

    // Send the request. Sending data is not supported.
    x.send(null);
    sent = true;

    return x;
}

if (typeof module !== 'undefined') module.exports = corslite;

},{}],2:[function(require,module,exports){
(function (global){
(function() {
	'use strict';

	var L = (typeof window !== "undefined" ? window['L'] : typeof global !== "undefined" ? global['L'] : null);
	var corslite = require('corslite');

	L.Routing = L.Routing || {};

	L.Routing.PgRouting = L.Class.extend({
		options: {
			serviceUrl: 'http://localhost:8080/geoserver/pgrouting/wfs',
			timeout: 30 * 1000,
			urlParameters: {
				version: '1.0.0',
				request: 'GetFeature',
				outputFormat: 'application/json'
			}
		},

		initialize: function(typeName, options) {
			this._typeName = typeName;
			L.Util.setOptions(this, options);
		},

		route: function(waypoints, callback, context, options) {
			var timedOut = false,
				wps = [],
				url,
				timer,
				wp,
				i;

			options = options || {};
			url = this.buildRouteUrl(waypoints, options);

			timer = setTimeout(function() {
								timedOut = true;
								callback.call(context || callback, {
									status: -1,
									message: 'pgRouting GeoServer WFS request timed out.'
								});
							}, this.options.timeout);

			// Create a copy of the waypoints, since they
			// might otherwise be asynchronously modified while
			// the request is being processed.
			for (i = 0; i < waypoints.length; i++) {
				wp = waypoints[i];
				wps.push({
					latLng: wp.latLng,
					name: wp.name,
					options: wp.options
				});
			}

			corslite(url, L.bind(function(err, resp) {
				var data;

				clearTimeout(timer);
				if (!timedOut) {
					if (!err) {
						data = JSON.parse(resp.responseText);
						this._routeDone(data, wps, callback, context);
					} else {
						callback.call(context || callback, {
							status: -1,
							message: 'HTTP request failed: ' + err
						});
					}
				}
			}, this));

			return this;
		},

		_routeDone: function(response, inputWaypoints, callback, context) {
			var alts = [],
				totalDistance = 0,
				totalTime = 0,
				routeCoords = [],
				viaCoords = [],
				viaIndices = [],
				instructions = [],
				edgeCoords,
				i,
				feature,
				actualWaypoints;

			context = context || callback;
			/*
			if (response.info.errors && response.info.errors.length) {
				callback.call(context, {
					// TODO: include all errors
					status: response.info.errors[0].details,
					message: response.info.errors[0].message
				});
				return;
			}
			*/

			for (i = 0; i < response.features.length; i++) {
				feature = response.features[i];
				edgeCoords = this._coordsToLatLngs(feature.geometry.coordinates);
				if ((feature.properties.pointType & 1) || (feature.properties.pointType & 4)) {
					viaCoords.push(edgeCoords[0]);
					viaIndices.push(routeCoords.length);
				}
				if (feature.properties.pointType & 2) {
					viaCoords.push(edgeCoords[edgeCoords.length - 1]);
					viaIndices.push(routeCoords.length + edgeCoords.length - 1);
				}
				instructions = instructions.concat(this._convertInstructions(feature.properties, routeCoords, edgeCoords));
				routeCoords = routeCoords.concat(edgeCoords);
				totalDistance += feature.properties.distance;
				totalTime += feature.properties.cost * 3600;
			}

			actualWaypoints = this._toWaypoints(inputWaypoints, viaCoords);

			alts.push({
				name: '',
				coordinates: routeCoords,
				instructions: instructions,
				summary: {
					totalDistance: totalDistance,
					totalTime: Math.round(totalTime)
				},
				inputWaypoints: inputWaypoints,
				waypoints: actualWaypoints,
				waypointIndices: viaIndices
			});

			callback.call(context, null, alts);
		},

		_coordsToLatLngs: function(coords) {
			var latlngs = [],
				i;

			for (i = 0; i < coords.length; i++) {
				latlngs.push(new L.LatLng(coords[i][1], coords[i][0]));
			}

			return latlngs;
		},

		_toWaypoints: function(inputWaypoints, viaCoords) {
			var wps = [],
				i;
			for (i = 0; i < viaCoords.length; i++) {
				wps.push({
					latLng: viaCoords[i],
					name: inputWaypoints[i].name,
					options: inputWaypoints[i].options
				});
			}

			return wps;
		},

		buildRouteUrl: function(waypoints, options) {
			var points = [],
				i,
				baseUrl;
			
			for (i = 0; i < waypoints.length; i++) {
				points.push(waypoints[i].latLng.lng + '\\,' + waypoints[i].latLng.lat);
			}

			baseUrl = this.options.serviceUrl + L.Util.getParamString(L.extend({
					typeName: this._typeName,
					viewparams: 'points:' + points.join('|')
				}, this.options.urlParameters), baseUrl);

			return baseUrl;
		},

		_convertInstructions: function(props, routeCoords, edgeCoords) {
			var result = [],
				type,
				text,
				distance,
				time;

			text = (props.name) ? props.name : '';
			distance = props.distance;
			time = Math.round(props.cost * 3600);
			if (props.pointType & 1) {
				result.push({
					type: 'Straight',
					text: text,
					distance: distance,
					time: time,
					index: 0
				});
				return result;
			}

			type = this._getInstructionType(routeCoords[routeCoords.length - 2], routeCoords[routeCoords.length - 1], edgeCoords[1]);
			result.push({
				type: type,
				text: text,
				distance: distance,
				time: time,
				index: routeCoords.length
			});

			if (props.pointType & 2) {
				result.push({
					type: 'DestinationReached',
					text: 'Finish!',
					distance: 0,
					time: 0,
					index: routeCoords.length + edgeCoords.length - 1
				});
			}

			return result;
		},

		_getInstructionType: function(latLng1, latLng2, latLng3) {
			var type,
				ax,
				ay,
				bx,
				by,
				outerProduct,
				innerProduct,
				connectAngle;

			ax = latLng2.lng - latLng1.lng;
			ay = latLng2.lat - latLng1.lat;
			bx = latLng3.lng - latLng2.lng;
			by = latLng3.lat - latLng3.lat;
			outerProduct = ax * by - ay * bx;
			innerProduct = ax * bx + ay * by;
			connectAngle = Math.atan2(outerProduct, innerProduct) * 180 / Math.PI;
			//console.log(connectAngle);
			if (-10 <= connectAngle && connectAngle <= 10) {
				type = 'Straight';
			} else if (-30 <= connectAngle && connectAngle <= -10) {
				type = 'SlightRight';
			} else if (-150 <= connectAngle && connectAngle <= -30) {
				type = 'Right';
			} else if (-170 <= connectAngle && connectAngle <= -150) {
				type = 'SharpRight';
			} else if (-180 <= connectAngle && connectAngle <= -170) {
				type = 'TurnAround';
			} else if (10 <= connectAngle && connectAngle <= 30) {
				type = 'SlightLeft';
			} else if (30 <= connectAngle && connectAngle <= 150) {
				type = 'Left';
			} else if (150 <= connectAngle && connectAngle <= 170) {
				type = 'SharpLeft';
			} else if (170 <= connectAngle && connectAngle <= 180) {
				type = 'TurnAround';
			}
			return type;
		}
	});

	L.Routing.pgRouting = function(typeName, options) {
		return new L.Routing.PgRouting(typeName, options);
	};

	module.exports = L.Routing.PgRouting;
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"corslite":1}]},{},[2]);
