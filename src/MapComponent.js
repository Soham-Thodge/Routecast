import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDirections from '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions';
import axios from 'axios';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css';
import './MapComponent.css';
import { FaHospital, FaFireExtinguisher, FaShieldAlt, FaHotel } from 'react-icons/fa';
import polyline from '@mapbox/polyline';

mapboxgl.accessToken = 'pk.eyJ1Ijoic29oYW0tdGhvZGdlIiwiYSI6ImNtMm5pc3F6dzA3YmQyanNiMWg0MXRteXgifQ.PD3_74PC5fHiJ2esK0w3DQ';
const OpenWeatherAPIKey = 'fc04595f97d2d60802ff7a3e8797c24a';

const WEATHER_THRESHOLDS = {
  SEVERE_WEATHER: {
    wind_speed: 20, // m/s
    rain: 50, // mm
    snow: 10, // mm
    visibility: 1000, // meters
  }
};

const getSeveritySummary = (severity) => {
  switch (severity) {
    case 'high':
      return 'Route conditions are potentially dangerous. Consider postponing travel.';
    case 'medium':
      return 'Use caution when traveling on this route.';
    case 'low':
      return 'Route conditions are generally safe for travel.';
    default:
      return 'Unable to determine route conditions.';
  }
};

const getWeatherIcon = (type) => {
  switch (type) {
    case 'wind':
      return '💨';
    case 'rain':
      return '🌧';
    case 'snow':
      return '❄';
    case 'traffic':
      return '🚗';
    default:
      return '⚠';
  }
};

const getRiskDescription = (factor) => {
  switch (factor.type) {
    case 'wind':
      return 'High wind speeds may affect vehicle stability';
    case 'rain':
      return 'Heavy rainfall may cause reduced visibility and wet roads';
    case 'snow':
      return 'Snowfall may cause slippery conditions';
    case 'traffic':
      return 'Heavy traffic congestion reported';
    default:
      return 'Potential hazardous conditions';
  }
};

const WeatherBox = ({ type, weather, coordinates, map }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (map && coordinates && containerRef.current) {
      // Convert map coordinates to pixel coordinates
      const pixelCoords = map.project(coordinates);

      // Position the weather card
      containerRef.current.style.left = `${pixelCoords.x}px`;
      containerRef.current.style.top = `${pixelCoords.y}px`;

      // Update position on map move
      const updatePosition = () => {
        const newPixelCoords = map.project(coordinates);
        containerRef.current.style.left = `${newPixelCoords.x}px`;
        containerRef.current.style.top = `${newPixelCoords.y}px`;
      };

      map.on('move', updatePosition);
      return () => map.off('move', updatePosition);
    }
  }, [map, coordinates]);

  if (!weather) return null;

  return (
    <div
      ref={containerRef}
      className={`weather-card ${isExpanded ? 'expanded' : ''}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      style={{
        position: 'absolute',
        transform: 'translate(-50%, -120%)', // Position above the point
        zIndex: 1000
      }}
    >
      <h3 className="weather-title">{type}</h3>
      <div className="weather-content">
        <div className="weather-main">
          <div className="temp-large">{weather.main.temp.toFixed(1)}°C</div>
          <div className="condition-main">{weather.weather[0].description}</div>
        </div>
        {isExpanded && (
          <div className="weather-details">
            <div className="detail-item">
              <span className="detail-label">Humidity:</span>
              <span className="detail-value">{weather.main.humidity}%</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Wind:</span>
              <span className="detail-value">{weather.wind.speed} m/s</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MapComponent = () => {
  // Add back all the necessary refs and state
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const directionsRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [startWeather, setStartWeather] = useState(null);
  const [endWeather, setEndWeather] = useState(null);
  const [routeCities, setRouteCities] = useState([]);
  const [error, setError] = useState(null);
  const [emergencyMarkers, setEmergencyMarkers] = useState([]);
  const [trafficData, setTrafficData] = useState(null);
  const [routeRecommendation, setRouteRecommendation] = useState(null);
  const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);
  const [emergencyRoutes, setEmergencyRoutes] = useState([]); // Store emergency routes
  const [showEmergencyRoutes, setShowEmergencyRoutes] = useState(false);
  const [activeEmergencyRoute, setActiveEmergencyRoute] = useState(null);
  const [trafficLayerVisible, setTrafficLayerVisible] = useState(true);

  const toggleTrafficLayer = () => {
    if (mapRef.current) {
      const visibility = !trafficLayerVisible;
      mapRef.current.setLayoutProperty(
        'mapbox-traffic',
        'visibility',
        visibility ? 'visible' : 'none'
      );
      setTrafficLayerVisible(visibility);
    }
  };

  const fetchWeatherData = async (latitude, longitude) => {
    try {
      const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
        params: {
          lat: latitude,
          lon: longitude,
          appid: OpenWeatherAPIKey,
          units: 'metric',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching weather data:', error);
      setError('Failed to fetch weather data. Please try again.');
      return null;
    }
  };

  const fetchCityName = async (latitude, longitude) => {
    try {
      const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`, {
        params: {
          access_token: mapboxgl.accessToken,
          types: 'place',
          limit: 1,
        },
      });

      const features = response.data.features;
      return features.length > 0 ? features[0].place_name : 'Unknown Location';
    } catch (error) {
      console.error('Error fetching city name:', error);
      return 'Unknown Location';
    }
  };

  const analyzeRouteConditions = (weatherData) => {
    let riskFactors = [];
    let severity = 'low';

    weatherData.forEach(point => {
      if (point.wind.speed > WEATHER_THRESHOLDS.SEVERE_WEATHER.wind_speed) {
        riskFactors.push({ type: 'wind', severity: 'high' });
      }
      if (point.weather[0].main === 'Rain' && point.rain?.['1h'] > WEATHER_THRESHOLDS.SEVERE_WEATHER.rain) {
        riskFactors.push({ type: 'rain', severity: 'high' });
      }
      if (point.weather[0].main === 'Snow' && point.snow?.['1h'] > WEATHER_THRESHOLDS.SEVERE_WEATHER.snow) {
        riskFactors.push({ type: 'snow', severity: 'high' });
      }
      if (point.visibility < WEATHER_THRESHOLDS.SEVERE_WEATHER.visibility) {
        riskFactors.push({ type: 'visibility', severity: 'high' });
      }
    });

    // Determine overall severity
    if (riskFactors.some(factor => factor.severity === 'high')) {
      severity = 'high';
    } else if (riskFactors.length > 0) {
      severity = 'medium';
    }

    return {
      severity,
      summary: getSeveritySummary(severity),
      details: riskFactors.map(factor => ({
        icon: getWeatherIcon(factor.type),
        text: getRiskDescription(factor)
      }))
    };
  };

  // Function to fetch traffic data
  const fetchTrafficData = async (coordinates) => {
    try {
      // Add traffic layer to map
      if (mapRef.current) {
        mapRef.current.addLayer({
          id: 'traffic',
          type: 'line',
          source: {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-traffic-v1'
          },
          'source-layer': 'traffic',
          paint: {
            'line-color': [
              'match',
              ['get', 'congestion'],
              'low', '#4CAF50',
              'moderate', '#FFA000',
              'heavy', '#FF5252',
              'severe', '#D32F2F',
              '#4CAF50'
            ],
            'line-width': 2
          }
        });
      }

      // Fetch traffic data from Mapbox API
      const response = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates.join(';')}`,
        {
          params: {
            access_token: mapboxgl.accessToken,
            annotations: 'congestion'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching traffic data:', error);
      return null;
    }
  };

  const handleRouteUpdate = async (event) => {
    if (!directionsRef.current) return;

    const origin = directionsRef.current.getOrigin();
    const destination = directionsRef.current.getDestination();

    setError(null);

    if (!origin || !origin.geometry || !origin.geometry.coordinates) {
      setError('Please enter a valid start location');
      return;
    }

    if (!destination || !destination.geometry || !destination.geometry.coordinates) {
      setError('Please enter a valid destination');
      return;
    }

    // Store coordinates
    setStartCoords(origin.geometry.coordinates);
    setEndCoords(destination.geometry.coordinates);

    // Update weather for start and end points
    const startWeatherData = await fetchWeatherData(
      origin.geometry.coordinates[1],
      origin.geometry.coordinates[0]
    );
    setStartWeather(startWeatherData);

    const endWeatherData = await fetchWeatherData(
      destination.geometry.coordinates[1],
      destination.geometry.coordinates[0]
    );
    setEndWeather(endWeatherData);

    // Get route data from the event
    if (event && event.route && event.route[0]) {
      const steps = event.route[0].legs[0].steps;
      const sampledPoints = steps.filter((_, index) => index % 5 === 0);
      const routeGeometry = event.route[0].geometry;
      fetchEmergencyServices(routeGeometry);

      const cities = await Promise.all(
        sampledPoints.map(async (step) => {
          const [lng, lat] = step.maneuver.location;
          const cityName = await fetchCityName(lat, lng);
          const weather = await fetchWeatherData(lat, lng);
          return {
            cityName,
            weather,
            coordinates: [lng, lat]
          };
        })
      );

      const uniqueCities = cities.filter((city, index, self) =>
        index === self.findIndex((c) => c.cityName === city.cityName)
      );
      setRouteCities(uniqueCities);

      // Collect weather data for analysis
      const weatherPoints = await Promise.all(
        sampledPoints.map(step => {
          const [lng, lat] = step.maneuver.location;
          return fetchWeatherData(lat, lng);
        })
      );

      // Generate route recommendation using only weather data
      const recommendation = analyzeRouteConditions(weatherPoints);
      setRouteRecommendation(recommendation);
    }
  };

  // New component for route recommendations
  const RouteRecommendation = ({ weatherData, trafficData }) => {
    const [recommendation, setRecommendation] = useState(null);

    useEffect(() => {
      if (weatherData && weatherData.length > 0) {
        const analysis = analyzeRouteConditions(weatherData, trafficData);
        setRecommendation(analysis);
      }
    }, [weatherData, trafficData]);

    if (!recommendation) return null;

    return (
      <div className="recommendation-card">
        <h3 className="recommendation-title">Route Analysis</h3>
        <div className={`recommendation-status ${recommendation.severity}`}>
          <span className="status-indicator"></span>
          {recommendation.summary}
        </div>
        <div className="recommendation-details">
          {recommendation.details.map((detail, index) => (
            <div key={index} className="detail-item">
              <span className="detail-icon">{detail.icon}</span>
              <span className="detail-text">{detail.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    // Add custom styles to the head of the document
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `

    .mapboxgl-ctrl-directions .directions-control-inputs {
        background: white;
        padding: 10px;
        border-radius: 4px 4px 0 0;
      }
         .directions-control-directions .directions-control-directions-instructions {
        color: white !important;
      }
         .directions-control-directions {
        max-height: 50vh !important;
        overflow-y: auto !important;
      }
        .mapboxgl-ctrl-directions {
        background: rgba(0, 0, 0, 0.7) !important;
        width: 300px !important;
      }

      .weather-cards-container {
        position: absolute;
        z-index: 1000;
        pointer-events: none;
      }

      .weather-cards-container > * {
        pointer-events: auto;
      }

      .weather-card {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        width: 120px;
        padding: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
        position: absolute;
        z-index: 1001 !important;
      }

      .weather-card:hover, .weather-card.expanded {
        width: 240px;
        transform: scale(1.05);
      }

      .weather-card:not(:hover):not(.expanded) .weather-details,
      .weather-card:not(:hover):not(.expanded) .condition-main {
        display: none;
      }

      .weather-card:not(:hover):not(.expanded) .weather-title {
        font-size: 12px;
        margin-bottom: 4px;
        padding-bottom: 4px;
      }

      .weather-card:not(:hover):not(.expanded) .temp-large {
        font-size: 18px;
      }

      .weather-title {
        color: #1f2937;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid #e5e7eb;
      }

      .temp-large {
        font-size: 24px;
        font-weight: 600;
        color: #2563eb;
      }

      .condition-main {
        color: #4b5563;
        font-size: 12px;
        text-transform: capitalize;
      }

      .weather-details {
        margin-top: 8px;
        padding: 8px;
        background: #f8fafc;
        border-radius: 6px;
        font-size: 12px;
      }

      .route-city-marker {
        width: 12px;
        height: 12px;
        background: #2563eb;
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        transition: transform 0.2s ease;
        position: absolute;
      }

      .route-city-marker:hover {
        transform: scale(1.2);
      }

      .city-popup {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 12px;
        max-width: 200px;
      }

      .city-popup .city-name {
        font-size: 14px;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 8px;
      }

      .city-popup .city-weather {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .city-popup .temp {
        font-size: 18px;
        font-weight: 500;
        color: #2563eb;
      }

      .city-popup .condition {
        font-size: 12px;
        color: #4b5563;
      }

      .detail-item {
        display: flex;
        justify-content: space-between;
        margin: 4px 0;
        font-size: 12px;
      }

      .detail-label {
        color: #64748b;
      }

      .detail-value {
        color: #1e293b;
        font-weight: 500;
      }

      .cities-container {
        position: absolute;
        top: 100px;
        right: 24px;
        width: 280px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 16px;
        max-height: calc(100vh - 480px);
        overflow-y: auto;
        z-index: 1000;
      }

      .emergency-panel {
        position: absolute;
        bottom: 24px;
        right: 24px;
        width: 280px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        padding: 16px;
        z-index: 1000;
      }

      .emergency-title {
        font-size: 14px;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e5e7eb;
      }

      .emergency-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border-radius: 6px;
        background: #f8fafc;
        margin-bottom: 8px;
      }

      .emergency-icon {
        color: #dc2626;
      }

      .emergency-name {
        flex: 1;
        font-size: 12px;
        color: #1f2937;
      }

      .navigate-btn {
        padding: 4px 8px;
        font-size: 12px;
        color: white;
        background: #2563eb;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .navigate-btn:hover {
        background: #1d4ed8;
      }

      .route-analysis-container {
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 400px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            padding: 16px;
            z-index: 1000;
          }

      .route-analysis-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0;
          }
      
          .route-analysis-header {
            margin-bottom: 12px;
            text-align: center;
          }
      .route-status {
            text-align: center;
            padding: 12px;
            border-radius: 6px;
            margin: 12px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }

          .route-status.high {
            background: #fee2e2;
            color: #dc2626;
          }

          .route-status.medium {
            background: #fef3c7;
            color: #d97706;
          }

          .route-status.low {
            background: #dcfce7;
            color: #16a34a;
          }

          .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
          }

          .status-indicator.high {
            background: #dc2626;
          }

          .status-indicator.medium {
            background: #d97706;
          }

          .status-indicator.low {
            background: #16a34a;
          }
            /* Emergency Services Panel */
        .emergency-panel {
          position: absolute;
          bottom: 24px;
          right: 24px;
          width: 300px;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 16px;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }

        .emergency-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          color: #dc2626;
          margin-bottom: 12px;
        }

        .emergency-list {
          max-height: 300px;
          overflow-y: auto;
        }

        .emergency-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          margin: 8px 0;
          background: rgba(220, 38, 38, 0.05);
          border-radius: 8px;
          transition: background 0.2s;
        }

        .emergency-item:hover {
          background: rgba(220, 38, 38, 0.1);
        }

        .emergency-name {
          flex: 1;
          font-size: 14px;
          color: #1f2937;
        }

        .navigate-btn {
          padding: 6px 12px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .navigate-btn:hover {
          background: #b91c1c;
        }

        .emergency-popup {
          font-family: Arial, sans-serif;
          padding: 8px;
        }

        .emergency-popup h4 {
          margin: 0 0 4px 0;
          font-size: 14px;
          color: #1f2937;
        }

        .emergency-popup p {
          margin: 0;
          font-size: 12px;
          color: #64748b;
        }
          .no-services {
          font-size: 14px;
          color: #64748b;
          text-align: center;
          padding: 12px;
        }
`;
    document.head.appendChild(styleSheet)

    if (!mapRef.current && mapContainerRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [-74.5, 40],
        zoom: 9,
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      mapRef.current.on('load', () => {
        setMapLoaded(true);

        directionsRef.current = new MapboxDirections({
          accessToken: mapboxgl.accessToken,
          unit: 'metric',
          profile: 'mapbox/driving',
          controls: {
            inputs: true,
            instructions: true,
          },
          alternatives: true,
        });

        mapRef.current.addControl(directionsRef.current, 'top-left');

        // Add event listeners
        directionsRef.current.on('route', handleRouteUpdate);
        directionsRef.current.on('origin', () => handleRouteUpdate(null));
        directionsRef.current.on('destination', () => handleRouteUpdate(null));
      });
    }

    return () => {
      styleSheet.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current && mapContainerRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [-74.5, 40],
        zoom: 9,
      });

      mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    }
  }, []);

  const fetchEmergencyServices = async (routeGeometry) => {
    if (!mapRef.current || !routeGeometry) return;

    // Clear existing markers and routes
    emergencyMarkers.forEach(marker => marker.remove());
    setEmergencyMarkers([]);
    setEmergencyRoutes([]);

    try {
      // Decode polyline to get route coordinates
      const decodedCoords = polyline.decode(routeGeometry);
      const routeCoordinates = decodedCoords.map(coord => [coord[1], coord[0]]); // Corrected to [lng, lat]

      // Calculate bounding box for the route with a dynamic buffer
      const lats = routeCoordinates.map(coord => coord[0]);
      const lngs = routeCoordinates.map(coord => coord[1]);

      const bufferDistance = 0.02; // ~2 km buffer (adjust as needed)
      const bbox = [
        Math.min(...lngs) - bufferDistance, // min longitude
        Math.min(...lats) - bufferDistance, // min latitude
        Math.max(...lngs) + bufferDistance, // max longitude
        Math.max(...lats) + bufferDistance  // max latitude
      ];

      const overpassQuery = `
        [out:json];
        (
          node["amenity"~"hospital|clinic"](${bbox});
          node["amenity"~"police|fire_station"](${bbox});
          node["emergency"~"yes"](${bbox});
          way["amenity"~"hospital|clinic"](${bbox});
          way["amenity"~"police|fire_station"](${bbox});
          way["emergency"~"yes"](${bbox});
          relation["amenity"~"hospital|clinic"](${bbox});
          relation["amenity"~"police|fire_station"](${bbox});
          relation["emergency"~"yes"](${bbox});
        );
        (._;>;);
        out;
      `;

      const response = await axios.get(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`
      );

      const newMarkers = [];
      const newRoutes = [];

      response.data.elements.forEach(element => {
        let coords;
        if (element.type === 'node') {
          coords = [element.lon, element.lat];
        } else if (element.center) {
          coords = [element.center.lon, element.center.lat];
        }

        if (coords) {
          // Calculate the distance to the nearest route point
          const closestRoutePoint = getClosestRoutePoint(coords, routeCoordinates);
          const distanceToRoute = calculateDistance(coords, closestRoutePoint);

          // Only include services within 5 km of the route
          if (distanceToRoute <= 5) {
            const type = element.tags?.amenity || element.tags?.emergency || 'Unknown';
            let name = element.tags?.name;
            
            if (!name) {
              switch (type) {
                case 'hospital':
                case 'clinic':
                  name = 'Medical Facility';
                  break;
                case 'police':
                  name = 'Police Station';
                  break;
                case 'fire_station':
                  name = 'Fire Department';
                  break;
                default:
                  name = 'Emergency Service';
              }
            }
            
            // Create popup content
            const popupContent = `
              <div class="emergency-popup">
                <h4>${name}</h4>
                <p>Type: ${type}</p>
              </div>
            `;
            

            const marker = new mapboxgl.Marker({
              color: '#dc2626',
              scale: 0.8
            })
              .setLngLat(coords)
              .setPopup(new mapboxgl.Popup().setHTML(popupContent))
              .addTo(mapRef.current);

            newMarkers.push(marker);
          
            if (showEmergencyRoutes) {
              const routeId = `emergency-route-${element.id}`;
              const route = {
                id: routeId,
                coordinates: [closestRoutePoint, coords]
              };
              newRoutes.push(route);
            }
          }
        }
      });

      setEmergencyMarkers(newMarkers);
      setEmergencyRoutes(newRoutes);
    } catch (error) {
      console.error('Error fetching emergency services:', error);
    }
  };

  // Utility function to calculate distance between two coordinates (Haversine formula)
  const calculateDistance = ([lon1, lat1], [lon2, lat2]) => {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };


  const getClosestRoutePoint = (emergencyCoords, routeCoords) => {
    let minDistance = Infinity;
    let closestPoint = routeCoords[0];

    routeCoords.forEach(routePoint => {
      const dx = emergencyCoords[0] - routePoint[0];
      const dy = emergencyCoords[1] - routePoint[1];
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = routePoint;
      }
    });

    return closestPoint;
  };

  useEffect(() => {
    if (mapRef.current && showEmergencyRoutes) {
      emergencyRoutes.forEach(route => {
        if (!mapRef.current.getSource(route.id)) {
          mapRef.current.addSource(route.id, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: route.coordinates
              }
            }
          });
  
          mapRef.current.addLayer({
            id: route.id,
            type: 'line',
            source: route.id,
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#dc2626',
              'line-width': 2,
              'line-dasharray': [2, 2]
            }
          });
        }
      });
    }
  
    return () => {
      if (mapRef.current) {
        emergencyRoutes.forEach(route => {
          if (mapRef.current.getLayer(route.id)) {
            mapRef.current.removeLayer(route.id);
            mapRef.current.removeSource(route.id);
          }
        });
      }
    };
  }, [emergencyRoutes, showEmergencyRoutes]);
  

  const getEmergencyIcon = (type) => {
    if (type.includes('hospital') || type.includes('clinic')) return <FaHospital className="emergency-icon" />;
    if (type.includes('fire')) return <FaFireExtinguisher className="emergency-icon" />;
    if (type.includes('police')) return <FaShieldAlt className="emergency-icon" />;
    return <FaHotel className="emergency-icon" />;
  };

  // Navigation handler
  const handleEmergencyNavigation = async (lngLat) => {
    if (directionsRef.current) {
      // Clear previous emergency route
      if (activeEmergencyRoute) {
        if (mapRef.current.getLayer(activeEmergencyRoute)) {
          mapRef.current.removeLayer(activeEmergencyRoute);
          mapRef.current.removeSource(activeEmergencyRoute);
        }
      }

      // Get the current origin
      const origin = directionsRef.current.getOrigin();
      if (!origin) {
        alert('Please set a starting point first');
        return;
      }

      try {
        // Create a unique ID for this emergency route
        const emergencyRouteId = `emergency-route-${Date.now()}`;
        
        // Fetch directions from Mapbox API
        const response = await axios.get(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.geometry.coordinates[0]},${origin.geometry.coordinates[1]};${lngLat.lng},${lngLat.lat}`,
          {
            params: {
              access_token: mapboxgl.accessToken,
              geometries: 'geojson',
              overview: 'full'
            }
          }
        );

        const route = response.data.routes[0];
        
        // Add the emergency route layer
        mapRef.current.addSource(emergencyRouteId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: route.geometry
          }
        });

        mapRef.current.addLayer({
          id: emergencyRouteId,
          type: 'line',
          source: emergencyRouteId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#dc2626',
            'line-width': 4,
            'line-dasharray': [2, 1]
          }
        });

        // Store the active emergency route ID
        setActiveEmergencyRoute(emergencyRouteId);

        // Fit bounds to show the entire emergency route
        const coordinates = route.geometry.coordinates;
        const bounds = coordinates.reduce((bounds, coord) => {
          return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

        mapRef.current.fitBounds(bounds, {
          padding: 50,
          duration: 1000
        });

        // Add pulsing effect to the destination marker
        const size = 150;
        const pulsingDot = {
          width: size,
          height: size,
          data: new Uint8Array(size * size * 4),
          onAdd: function() {
            const canvas = document.createElement('canvas');
            canvas.width = this.width;
            canvas.height = this.height;
            this.context = canvas.getContext('2d');
          },
          render: function() {
            const duration = 1000;
            const t = (performance.now() % duration) / duration;
            const radius = (size / 2) * 0.3;
            const outerRadius = (size / 2) * 0.7 * t;
            const context = this.context;

            context.clearRect(0, 0, this.width, this.height);
            context.beginPath();
            context.arc(
              this.width / 2,
              this.height / 2,
              outerRadius,
              0,
              Math.PI * 2
            );
            context.fillStyle = `rgba(220, 38, 38, ${1 - t})`;
            context.fill();

            context.beginPath();
            context.arc(
              this.width / 2,
              this.height / 2,
              radius,
              0,
              Math.PI * 2
            );
            context.fillStyle = 'rgba(220, 38, 38, 1)';
            context.strokeStyle = 'white';
            context.lineWidth = 2 + 4 * (1 - t);
            context.fill();
            context.stroke();

            this.data = context.getImageData(
              0,
              0,
              this.width,
              this.height
            ).data;

            mapRef.current.triggerRepaint();
            return true;
          }
        };

        // Add the pulsing dot to the map
        mapRef.current.addImage('pulsing-dot', pulsingDot, { pixelRatio: 2 });

        // Add a point source and layer for the pulsing dot
        const dotSourceId = `emergency-dot-${emergencyRouteId}`;
        mapRef.current.addSource(dotSourceId, {
          type: 'geojson',
          data: {
            type: 'Point',
            coordinates: [lngLat.lng, lngLat.lat]
          }
        });

        mapRef.current.addLayer({
          id: `emergency-dot-layer-${emergencyRouteId}`,
          type: 'symbol',
          source: dotSourceId,
          layout: {
            'icon-image': 'pulsing-dot',
            'icon-allow-overlap': true
          }
        });

        // Set the new destination
        directionsRef.current.setDestination([lngLat.lng, lngLat.lat]);

      } catch (error) {
        console.error('Error creating emergency route:', error);
        alert('Error creating emergency route. Please try again.');
      }
    }
  };

  // Clean up function for emergency routes
  useEffect(() => {
    return () => {
      if (mapRef.current && activeEmergencyRoute) {
        if (mapRef.current.getLayer(activeEmergencyRoute)) {
          mapRef.current.removeLayer(activeEmergencyRoute);
          mapRef.current.removeSource(activeEmergencyRoute);
        }
      }
    };
  }, [activeEmergencyRoute]);

  const toggleEmergencyRoutes = () => {
    setShowEmergencyRoutes(!showEmergencyRoutes);
  };

  return (
    <div>
      <div
        ref={mapContainerRef}
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
        }}
      />
      <div 
        style={{
          position: 'absolute',
          top: '10px',
          right: '50px',
          zIndex: 1
        }}
      >
        <button
          className="navigate-btn"
          onClick={toggleTrafficLayer}
          style={{
            padding: '8px 16px',
            backgroundColor: trafficLayerVisible ? '#dc2626' : '#4b5563',
            transition: 'background-color 0.2s'
          }}
        >
          {trafficLayerVisible ? 'Hide Traffic' : 'Show Traffic'}
        </button>
      </div>
      {routeRecommendation && (
        <div className="route-analysis-container">
          <div className="route-analysis-header">
            <h3 className="route-analysis-title">Route Analysis</h3>
          </div>
          <div className={`route-status ${routeRecommendation.severity}`}>
            <span className={`status-indicator ${routeRecommendation.severity}`}></span>
            {routeRecommendation.summary}
          </div>
          <div className="route-details">
            {routeRecommendation.details.map((detail, index) => (
              <div key={index} className="detail-item">
                <span className="detail-icon">{detail.icon}</span>
                <span className="detail-text">{detail.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {routeCities.map((city, index) => (
        <WeatherBox
          key={index}
          type={city.cityName}
          weather={city.weather}
          coordinates={[city.weather.coord.lon, city.weather.coord.lat]}
          map={mapRef.current}
        />
      ))}
      {/* Emergency Services Panel */}
      <div className="emergency-panel">
        <div className="emergency-title">
          <FaHospital className="emergency-icon" />
          Emergency Services Along Route
          <button onClick={toggleEmergencyRoutes} className="navigate-btn">
            {showEmergencyRoutes ? 'Hide Routes' : 'Show Routes'}
          </button>
        </div>
        <div className="emergency-list">
          {emergencyMarkers
            .filter(marker => marker && marker._popup && marker._popup._content)
            .map((marker, index) => {
              const popupContent = marker._popup._content;
              const name = popupContent.querySelector('h4')?.textContent || 'Emergency Service';
              const type = popupContent.querySelector('p')?.textContent || 'Unknown';

              return (
                <div key={index} className="emergency-item">
                  {getEmergencyIcon(type)}
                  <span className="emergency-name">{name}</span>
                  <button
                    className="navigate-btn"
                    onClick={() => handleEmergencyNavigation(marker.getLngLat())}
                  >
                    Navigate
                  </button>
                </div>
              );
            })}
        </div>
      </div>
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
};

export default MapComponent;