import functions from '@google-cloud/functions-framework';
import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

// Google Places API v1 Text Search endpoint (new REST API)
const API_KEY = process.env.API_KEY;
const textSearchUrl = 'https://places.googleapis.com/v1/places:searchText'; // Search companies by text query

// Entry point GCP Cloud Function: Find companies by type within geographic radius
functions.http('mapslayer', async(req, res) => {
    console.log("GOT REQUEST");
    console.log(JSON.stringify(req.body, null, 2));

    try {
        let name = "YOUR_PROJECT_NAME"; // Session prefix for lead generation pipeline

        // Target company types for B2B lead generation (UAE relocation services)
        let types = [
            "Financial Companies",
            "Law Firms",
            "Media Companies",
            "Multinational Companies",
            "Consultancies",
            "Governments",
            "DMC (Destination Management Companies)",
            "Relocation Companies",
            "Travel Agencies",
            "Mining Companies",
            "Large Corporations"
        ];
        let uniqueArray = []; // Deduplicated Place IDs across all company types

        // Generate unique session filename: ESTAI-YYYY-MM-DD-HH-MM-SS.json
        let currentDate = new Date();
        let year = currentDate.getFullYear();
        let month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are zero-based
        let day = String(currentDate.getDate()).padStart(2, '0');
        let hours = String(currentDate.getHours()).padStart(2, '0');
        let minutes = String(currentDate.getMinutes()).padStart(2, '0');
        let seconds = String(currentDate.getSeconds()).padStart(2, '0');

        let formattedDate = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`; // Timestamped session file
        name = name + `-${formattedDate}.json`;

        // Search each company type sequentially
        for (let type of types) {
            let { location, radius } = req.body; // User-provided search center + radius
            const text = type; // Current company type query
            console.log("LOCATION:", location);

            location = await getCoordinates(location); // Geocode address → lat,lon string
            console.log("LOC2:", location);
            const data = await main(location, radius, text); // Grid search + deduplicate
            console.log("DATA2:", data);
            uniqueArray = [...new Set([...uniqueArray, ...data])]; // Merge unique Place IDs
        }

        // Create empty session file in GCS (will be populated by getDetails)
        await writeTemp({}, name);

        // Chain to next pipeline stage: extract website + reviews for each Place ID
        axios.post("http://localhost:3000/getDetails", { // Send Place IDs for detailed processing
            name: name,
            places_temp: uniqueArray,
            sessionId: name
        });

        res.json({ fulfillmentText: "STARTED" }); // Pipeline started successfully
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred');
    }
});

// Places API Text Search: Paginated results within rectangular bounding box
async function getPlaces(location, radius, text) {
    let url = textSearchUrl;
    let results = [];
    let nextPageToken = null;

    const coord = await getBoundingBox(location, radius); // Convert radius → rectangle bounds
    let data = {
        "textQuery": text, // Company type (e.g., "Financial Companies")
        "locationRestriction": {
            "rectangle": {
                "high": {
                    "latitude": coord.topLeft.lat,
                    "longitude": coord.bottomRight.lon // Top-right corner
                },
                "low": {
                    "latitude": coord.bottomRight.lat,
                    "longitude": coord.topLeft.lon // Bottom-left corner
                }
            }
        }
    };

    // Handle pagination (nextPageToken requires 5s cooldown)
    do {
        if (nextPageToken) {
            data.pageToken = nextPageToken;
        }

        const response = await axios.post(url, data, {
            headers: {
                "X-Goog-Api-Key": API_KEY,
                "Content-Type": "application/json",
                "X-Goog-FieldMask": "places.id,nextPageToken" // Only fetch Place IDs
            }
        });

        if (response.data.places) {
            results.push(...response.data.places); // Accumulate Place objects
        } else {
            break;
        }

        nextPageToken = response.data.nextPageToken;
        console.log("PAGE_TOKEN", nextPageToken);
        console.log("PLCAES:", response.data.places);

        if (nextPageToken) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // API token activation delay
        }
    } while (nextPageToken);

    console.log(`LOC3, ${coord.topLeft.lat},${coord.topLeft.lon}|${coord.bottomRight.lat},${coord.bottomRight.lon}`);
    return results; // Array of Place objects (contains .id)
}

// Orchestrate grid-based search: Divide large radius into 2km squares for better coverage
async function main(location, radius, text) {
    try {
        console.log("MAIN:", location, radius);
        const squares = await getCentersOfSmallerSquares(location, radius, 2000); // 2km grid cells
        console.log("SQUARES:", squares);

        let places = [];
        for (const square of squares) {
            const place = await getPlaces(square, radius, text); // Search each grid cell
            places.push(...place);
        }

        console.log(`Found ${places.length} places`);
        console.log(places);
        return places; // Return all found Place objects
    } catch (error) {
        console.error(error);
    }
}

// Geocode address string → latitude,longitude coordinate pair
async function getCoordinates(address) {
    try {
        const encodedAddress = encodeURIComponent(address);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${API_KEY}`;

        const response = await axios.get(url);

        if (response.data.status === 'OK') {
            const location = response.data.results[0].geometry.location;
            console.log('Latitude:', location.lat);
            console.log('Longitude:', location.lng);
            return `${location.lat}, ${location.lng}`; // Return "lat, lon" string
        } else {
            console.error('Geocoding API error:', response.data.status);
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Grid division helper: Split search radius into smaller squares (improves API coverage)
async function getCentersOfSmallerSquares(center, halfSideLength, smallSquareSize) {
    const [latitude, longitude] = center.split(',').map(Number);
    const earthRadius = 6378137; // Earth's radius in meters

    console.log("LAT:", latitude);
    const latDiff = (smallSquareSize / earthRadius) * (180 / Math.PI); // Latitude delta per small square
    const lonDiff = (smallSquareSize / earthRadius) * (180 / Math.PI) / Math.cos(latitude * Math.PI / 180); // Longitude delta

    const numSquaresPerSide = Math.ceil((2 * halfSideLength) / smallSquareSize);
    const centers = [];

    // Generate grid of square center coordinates
    for (let i = 0; i < numSquaresPerSide; i++) {
        for (let j = 0; j < numSquaresPerSide; j++) {
            const topLeft = {
                lat: latitude + latDiff * (i - numSquaresPerSide / 2),
                lon: longitude - lonDiff * (j - numSquaresPerSide / 2)
            };
            const bottomRight = {
                lat: latitude + latDiff * (i - numSquaresPerSide / 2 + 1),
                lon: longitude - lonDiff * (j - numSquaresPerSide / 2 + 1)
            };

            const squareCenter = `${(topLeft.lat + bottomRight.lat) / 2}, ${(topLeft.lon + bottomRight.lon) / 2}`; // Center point
            centers.push(squareCenter);
        }
    }

    return centers; // Array of "lat, lon" grid centers
}

// Convert center coordinate + radius → rectangular bounding box for Places API
async function getBoundingBox(coordinateString, radiusMeters) {
    const [latitude, longitude] = coordinateString.split(',').map(Number);
    console.log("1:", latitude, longitude);

    const radiusKm = radiusMeters / 1000;
    const latR = latitude * Math.PI / 180;
    const deltaLat = radiusKm / 111.32; // ~1km per degree latitude
    const deltaLon = radiusKm / (111.32 * Math.cos(latR)); // Longitude varies by latitude

    console.log("2:", deltaLat, deltaLon);
    return {
        topLeft: { lat: latitude + deltaLat, lon: longitude - deltaLon },
        bottomRight: { lat: latitude - deltaLat, lon: longitude + deltaLon }
    };
}

// GCS Storage client
const storage = new Storage();

const bucketName = 'your-session-bucket'; // Session storage bucket
const tempFilePath = path.join(process.cwd(), 'temp.json'); // Local temp file for GCS sync

// Initialize empty session file in GCS (populated by downstream services)
async function writeTemp(sessions, fileName) {
    try {
        fs.writeFileSync(tempFilePath, JSON.stringify(sessions, null, 2));
        console.log("Wrote sessions:", JSON.stringify(sessions, null, 2));
        await uploadFile(fileName);
    } catch (err) {
        console.error('Error writing sessions:', err);
    }
}

// Upload session temp file → GCS bucket
async function uploadFile(fileName) {
    try {
        await storage.bucket(bucketName).upload(tempFilePath, {
            destination: fileName, // e.g., "ESTAI-2026-01-31-01-36-00.json"
        });
        console.log(`${fileName} uploaded to ${bucketName}`);
    } catch (err) {
        console.error('Error uploading file:', err);
    }
}