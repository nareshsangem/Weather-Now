// src/App.jsx
import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import {
  WiDaySunny,
  WiDaySunnyOvercast,
  WiCloud,
  WiCloudy,
  WiFog,
  WiRainMix,
  WiRain,
  WiSnow,
  WiShowers,
} from "react-icons/wi";

import "leaflet/dist/leaflet.css";

// ✅ Fix default leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// 🔹 Helper component to update map view
function MapUpdater({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) {
      map.setView([location.lat, location.lon], 8, { animate: true });
    }
  }, [location, map]);
  return null;
}

// 🔹 Weather icon + text mapping
const weatherMap = {
  0: { icon: <WiDaySunny className="text-yellow-500 text-2xl md:text-4xl" />, text: "Clear sky" },
  1: { icon: <WiDaySunnyOvercast className="text-yellow-400 text-2xl md:text-4xl" />, text: "Mainly clear" },
  2: { icon: <WiCloud className="text-gray-400 text-2xl md:text-4xl" />, text: "Partly cloudy" },
  3: { icon: <WiCloudy className="text-gray-500 text-2xl md:text-4xl" />, text: "Overcast" },
  45: { icon: <WiFog className="text-gray-400 text-2xl md:text-4xl" />, text: "Fog" },
  48: { icon: <WiFog className="text-gray-500 text-2xl md:text-4xl" />, text: "Depositing rime fog" },
  51: { icon: <WiRainMix className="text-blue-400 text-2xl md:text-4xl" />, text: "Light drizzle" },
  61: { icon: <WiRain className="text-blue-500 text-2xl md:text-4xl" />, text: "Rain" },
  71: { icon: <WiSnow className="text-blue-300 text-2xl md:text-4xl" />, text: "Snow" },
  80: { icon: <WiShowers className="text-blue-400 text-2xl md:text-4xl" />, text: "Rain showers" },
};

export default function App() {
  // User weather + location
  const [userWeather, setUserWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userLocation, setUserLocation] = useState(null);

  // City search states
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [cityLocation, setCityLocation] = useState(null);
  const [cityWeather, setCityWeather] = useState(null);
  const [searchError, setSearchError] = useState("");

  const searchRef = useRef(null);
  const suppressFetchRef = useRef(false); // <--- prevents immediate suggestion fetch after selection

  // ✅ Detect outside click → close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🔹 Fetch live weather for user location
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        setUserLocation({ lat: latitude, lon: longitude });

        try {
          if (!navigator.onLine) throw new Error("offline");
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
          );
          if (!res.ok) throw new Error("fetch-error");
          const data = await res.json();
          setUserWeather(data.current_weather);
        } catch (err) {
          console.error(err);
          setError("Please check your internet connection.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setError("Unable to retrieve location.");
        setLoading(false);
      }
    );
  }, []);

  // 🔹 Fetch typing suggestions (debounced). Suppresses immediately after selection.
  useEffect(() => {
    const fetchSuggestions = async () => {
      // If we just selected a city, skip one suggestions cycle
      if (suppressFetchRef.current) {
        suppressFetchRef.current = false;
        return;
      }

      if (!query.trim()) {
        setSearchResults([]);
        setSearchError("");
        return;
      }

      try {
        if (!navigator.onLine) throw new Error("offline");
        // Only send the raw typed query to geocoding (no extra formatting)
        const q = encodeURIComponent(query.trim());
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=10&language=en&format=json`
        );
        if (!res.ok) throw new Error("fetch-error");
        const data = await res.json();
        if (data.results?.length) {
          setSearchResults(data.results);
          setSearchError("");
        } else {
          setSearchResults([]);
          setSearchError("City not found.");
        }
      } catch (err) {
        console.error(err);
        setSearchResults([]);
        setSearchError("Please check your internet connection.");
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  // 🔹 Select city from dropdown — only sets selection; closes dropdown and clears errors.
  const handleSelectCity = (city) => {
    // keep query readable for user, but suppress immediate suggestions
    const display = `${city.name}${city.admin1 ? `, ${city.admin1}` : ""}${
      city.country ? `, ${city.country}` : ""
    }`;
    setQuery(display);
    setSelectedCity(city);
    setSearchResults([]); // close dropdown
    setSearchError("");
    suppressFetchRef.current = true; // prevent suggestions fetching caused by the query update
  };

  // 🔹 Search button → fetch weather + update map
  const handleSearchWeather = async () => {
    if (!selectedCity) {
      setSearchError("Please select a city first.");
      return;
    }
    setSearchError("");
    setCityWeather(null);
    setCityLocation({ lat: selectedCity.latitude, lon: selectedCity.longitude });

    try {
      if (!navigator.onLine) {
        setSearchError("Please check your internet connection.");
        return;
      }
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${selectedCity.latitude}&longitude=${selectedCity.longitude}&current_weather=true`
      );
      if (!res.ok) throw new Error("fetch-error");
      const data = await res.json();
      setCityWeather(data.current_weather);
    } catch (err) {
      console.error(err);
      setSearchError("Please check your internet connection.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-100 to-blue-300 flex flex-col items-center">
      {/* Header with user weather */}
      <header className="w-full bg-blue-600 text-white shadow-md p-4 flex flex-col md:flex-row justify-between items-center gap-2">
        <h1 className="font-bold text-lg md:text-2xl">Weather Now 🌦️</h1>
        {userWeather && !loading && !error && (
          <div className="flex items-center gap-2 text-sm md:text-lg">
            <span className="ml-2 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="font-semibold">Live</span>
            <span className="bg-amber-50 rounded-full p-1">
              {weatherMap[userWeather.weathercode]?.icon}
            </span>
            <span className="font-bold">
              {weatherMap[userWeather.weathercode]?.text || "Unknown"}
            </span>
            <span className="font-bold">{userWeather.temperature}°C</span>
            <span className="text-sm font-bold">
              Wind: {userWeather.windspeed} km/h
            </span>
          </div>
        )}
      </header>

      <main className="flex flex-col md:flex-row w-full max-w-6xl p-4 gap-6">
        {/* Left Section */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Search Section */}
          <section className="bg-yellow-100 rounded-2xl shadow-lg p-6 relative">
            <h2 className="text-xl font-bold mb-4">Search Weather</h2>
            <div className="flex flex-col sm:flex-row gap-2 relative" ref={searchRef}>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedCity(null); // force re-selection
                  setSearchError("");
                }}
                placeholder="Enter city name..."
                className="flex-1 p-3 rounded-xl border bg-blue-100 border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearchWeather}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                Search
              </button>

              {/* Suggestions Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute top-full mt-2 bg-white border rounded-lg shadow max-h-60 overflow-y-auto w-full z-10">
                  <ul>
                    {searchResults.map((city) => (
                      <li
                        key={`${city.latitude}-${city.longitude}`}
                        onClick={() => handleSelectCity(city)}
                        className="px-4 py-2 hover:bg-blue-100 cursor-pointer text-sm"
                      >
                        {city.name}
                        {city.admin2 ? `, ${city.admin2}` : ""}
                        {city.admin1 ? `, ${city.admin1}` : ""}
                        , {city.country}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {searchError && (
              <p className="text-red-600 font-semibold mt-3">{searchError}</p>
            )}
          </section>

          {/* City Weather */}
          <section className="bg-yellow-100 rounded-2xl shadow-lg p-6 text-center">
            <h2 className="text-xl font-semibold mb-2 border-2 border-gray-400 p-2 rounded-lg bg-blue-200">
              City Weather
            </h2>
            {!selectedCity && <p className="text-gray-500">Search for a city to view weather</p>}
            {selectedCity && cityWeather && (
              <div className="space-y-3">
                <p className="font-bold text-lg">
                  {selectedCity.name}
                  {selectedCity.admin2 ? `, ${selectedCity.admin2}` : ""}
                  {selectedCity.admin1 ? `, ${selectedCity.admin1}` : ""}
                  , {selectedCity.country}
                </p>
                <div className="flex flex-col items-center ">
                  <span className="bg-blue-100 rounded-full p-1">
                    {weatherMap[cityWeather.weathercode]?.icon}
                  </span>
                  <p className="text-lg font-bold text-gray-900 mt-2">
                    {weatherMap[cityWeather.weathercode]?.text || "Unknown"}
                  </p>
                </div>
                <p className="text-4xl font-bold">{cityWeather.temperature}°C</p>
                <p className="text-sm font-semibold text-gray-700">
                  Wind: {cityWeather.windspeed} km/h
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Map Section */}
        <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-center">Map</h2>
          <div className="w-full h-96 rounded-lg overflow-hidden">
            <MapContainer
              center={userLocation ? [userLocation.lat, userLocation.lon] : [20, 77]}
              zoom={5}
              scrollWheelZoom={true}
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapUpdater location={cityLocation || userLocation} />
              {userLocation && (
                <Marker position={[userLocation.lat, userLocation.lon]}>
                  <Popup>Your Location</Popup>
                </Marker>
              )}
              {cityLocation && (
                <Marker position={[cityLocation.lat, cityLocation.lon]}>
                  <Popup>
                    {selectedCity?.name}
                    {selectedCity?.admin2 ? `, ${selectedCity.admin2}` : ""}
                    {selectedCity?.admin1 ? `, ${selectedCity.admin1}` : ""}
                    , {selectedCity?.country}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>
      </main>
    </div>
  );
}
