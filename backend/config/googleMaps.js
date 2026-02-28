const { Client } = require('@googlemaps/google-maps-services-js');

const googleMapsClient = new Client({});

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

module.exports = { googleMapsClient, GOOGLE_MAPS_API_KEY };
