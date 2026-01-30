import functions from '@google-cloud/functions-framework';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';

// GCP Cloud Function: Extract probability scores from processed session data
functions.http('getText', async(req, res) => {
    if (req.method === "POST") {
        console.log(req.body);
        const nameFile = req.body.sessionId; // Session JSON filename in GCS bucket

        // Download and parse session data from GCS
        let data = await downloadJsonFile('your-session-bucket', nameFile, nameFile);

        // Extract only probability scores for companies (post-GPT processing)
        const processedCompaniesData = {};
        for (const [website, company] of Object.entries(data)) {
            // Create response mapping: website → probability score only
            processedCompaniesData[website] = company.probability;
        }

        console.log("DATA:", processedCompaniesData);
        res.json({ fulfillmentText: processedCompaniesData }); // Return {website: probability}
    }
});

// GCS Storage client initialization
const storage = new Storage();

/**
 * Download session JSON file from GCS → parse → return object
 * Downloads to local filesystem then reads as JSON
 * @param {string} bucketName - GCS bucket name ('your-session-bucket')
 * @param {string} srcFilename - Source filename in bucket (session ID)
 * @param {string} destFilename - Local destination path for download
 * @returns {Promise<Object>} - Session data {website: {name, text, probability, ...}}
 */
async function downloadJsonFile(bucketName, srcFilename, destFilename) {
    const options = {
        // Local path where GCS file will be downloaded
        destination: destFilename,
    };

    // Download file from GCS bucket
    await storage.bucket(bucketName).file(srcFilename).download(options);

    console.log(
        `gs://${bucketName}/${srcFilename} downloaded to ${destFilename}.`
    );

    // Read downloaded file and parse JSON
    const rawdata = fs.readFileSync(destFilename);
    const jsonData = JSON.parse(rawdata);
    return jsonData; // Return parsed session object
}