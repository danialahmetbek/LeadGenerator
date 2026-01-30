import functions from '@google-cloud/functions-framework';
import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

// Google Maps Places API key (from GCP Secret Manager)
const API_KEY = process.env.API_KEY;
const detailsUrl = 'https://maps.googleapis.com/maps/api/place/details/json'; // Places Details API endpoint

// Main GCP Cloud Function: Batch process Place IDs → extract websites + reviews
functions.http('getDetails', async(req, res) => {
    let { name, places_temp } = req.body; // name: session ID, places_temp: array of Place IDs
    console.log("PLACES:", places_temp.length);

    // Base case: No more places → trigger GPT batch analysis pipeline
    if (places_temp.length == 0) {
        axios.post("http://localhost:3000/BatchProcessGPT", { // Send completed session to GPT analyzer
            sessionId: name
        });
        res.sendStatus(200);
        return;
    }

    // Process first 40 places (API quota limit per batch)
    let places = places_temp.slice(0, 40);
    const placeDetailsPromises = places.map(place => getPlaceDetails(place.id));
    const placeDetails = await Promise.all(placeDetailsPromises);

    let data = {}; // Result accumulator: {website: {name, text: reviews}}
    let i = 0;

    // Process each place: extract website + concatenate reviews (200 char limit per review)
    placeDetails.forEach(details => {
        if (details.website != undefined) {
            let reviewText = "";
            console.log(`Website: ${details.website}`);

            if (details.reviews && details.reviews.length > 0) {
                console.log("LENGTH:", details.reviews.length);
                const limitedReviews = details.reviews; // Use all available reviews
                limitedReviews.forEach(review => {
                    const temp = review.text.substring(0, 200); // Truncate long reviews
                    reviewText += temp + '\n';
                });
            }

            console.log(`Website: ${details.website}; Reviews: ${reviewText}`);
            const website = details.website;

            // Create company data object (merge reviews for duplicate websites)
            const param = {
                name: details.name,
                text: data[website]?.text + "\n" + reviewText // Append to existing data
            };
            data[website] = param;
            console.log('-----------------------------');
        } else {
            console.log("WEBSITE UNDEFINED:", i, "NAME:", details.name); // Skip places without websites
            i++;
        }
    });

    console.log("DATA2:", data);

    // Merge with existing session data from GCS
    const old_data = await downloadJsonFile(bucketName, name);
    const new_data = {...old_data, ...data }; // Spread merge (new data overrides duplicates)

    // Save updated session to GCS
    const resp1 = await writeTemp(new_data, name);

    // Recursive processing: chain next batch of 40 places
    if (places_temp.length !== 0) {
        axios.post("http://localhost:3000/getDetails", { // Self-call for remaining places
            name: name,
            places_temp: places_temp.slice(40) // Next batch
        });
    }
    res.sendStatus(200);
});

// Fetch detailed place data from Google Maps Places API
async function getPlaceDetails(placeId) {
    const url = `${detailsUrl}?place_id=${placeId}&fields=name,formatted_address,geometry,formatted_phone_number,website,rating,opening_hours,photos,reviews&reviews_sort=newest&key=${API_KEY}`;
    const response = await axios.get(url);
    return response.data.result; // Single place details object
}

// GCS Storage client
const storage = new Storage();

const bucketName = 'your-session-bucket'; // GCS bucket for session JSON files
const tempFilePath = path.join(process.cwd(), 'temp.json'); // Local temp file path

// Write session data to local temp.json → trigger GCS upload
async function writeTemp(sessions, fileName) {
    try {
        fs.writeFileSync(tempFilePath, JSON.stringify(sessions, null, 2));
        console.log("Wrote sessions:", JSON.stringify(sessions, null, 2));
        await uploadFile(fileName); // Upload to GCS bucket
    } catch (err) {
        console.error('Error writing sessions:', err);
    }
}

// Upload local temp.json → GCS session file
async function uploadFile(fileName) {
    try {
        await storage.bucket(bucketName).upload(tempFilePath, {
            destination: fileName, // Session filename (e.g., "ESTAI-2026-01-31.json")
        });
        console.log(`${fileName} uploaded to ${bucketName}`);
    } catch (err) {
        console.error('Error uploading file:', err);
    }
}

/**
 * Downloads session JSON from GCS → parse → return object
 * @param {string} bucketName - GCS bucket ('your-session-bucket')
 * @param {string} fileName - Session filename
 * @returns {Promise<Object>} - Session data {website: {name, text, ...}}
 */
async function downloadJsonFile(bucketName, fileName) {
    try {
        // Download file to local temp
        const tempFilePath = path.join(process.cwd(), 'temp.json');
        await storage.bucket(bucketName).file(fileName).download({ destination: tempFilePath });

        console.log(`Downloaded ${fileName} from bucket ${bucketName} to ${tempFilePath}`);

        // Parse JSON content
        const fileContent = fs.readFileSync(tempFilePath, 'utf8');
        const jsonData = JSON.parse(fileContent);

        return jsonData; // Return session object
    } catch (error) {
        console.error('Error downloading or parsing file:', error);
        throw error;
    }
}