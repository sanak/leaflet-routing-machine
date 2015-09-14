var map = L.map('map');

L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

L.Routing.control({
	waypoints: [
		L.latLng(34.944479, 135.702857),
		//L.latLng(34.944916, 135.702972),
		L.latLng(34.944530, 135.703476)
	],
	//router: L.Routing.graphHopper('f48ee041-ed02-4331-801a-a5b11514707c'),
	//router: L.Routing.mapbox('pk.eyJ1IjoibmFnYXNlIiwiYSI6IjZnYzBkT3MifQ.ckZKcY6JKHeIylxa0PWa6g'),
	router: L.Routing.pgRouting('muko'),
	geocoder: L.Control.Geocoder.nominatim(),
    routeWhileDragging: true,
    reverseWaypoints: true,
    showAlternatives: true,
    altLineOptions: {
        styles: [
            {color: 'black', opacity: 0.15, weight: 9},
            {color: 'white', opacity: 0.8, weight: 6},
            {color: 'blue', opacity: 0.5, weight: 2}
        ]
    }
}).addTo(map);
