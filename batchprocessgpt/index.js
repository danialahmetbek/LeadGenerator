import functions from '@google-cloud/functions-framework';
import { Storage } from '@google-cloud/storage';
import { CloudTasksClient } from '@google-cloud/tasks';
import { GoogleAuth } from 'google-auth-library';

// GCP Cloud Tasks client + authentication
const client = new CloudTasksClient();
const auth = new GoogleAuth();

// Environment variables for Cloud Tasks configuration
const project = process.env.PROJECT;     // GCP Project ID
const location = process.env.LOCATION;   // Cloud Tasks location (e.g., 'us-central1')
const queue = process.env.QUEUE;         // Cloud Tasks queue name
const url = process.env.URL;             // Target Cloud Function URL (gptlayer)
const email = process.env.EMAIL;         // Service account email for OIDC auth

// Create delayed task in GCP Cloud Tasks queue
// Tasks execute sequentially with 30s intervals (rate limiting)
async function createTask(element, delayInSeconds) {
    const parent = client.queuePath(project, location, queue);  // Queue path reference
    const payload = Buffer.from(JSON.stringify(element)).toString('base64');  // Base64 encode payload

    const headers = {
        'Content-Type': 'application/json'
    };
    
    // Generate OAuth2 token for Cloud Function invocation
    const authClient = await auth.getClient();
    const tokenResponse = await authClient.getAccessToken();
    const token = tokenResponse.token;
    headers['Authorization'] = `Bearer ${token}`;
    
    const task = {
        httpRequest: {
            httpMethod: 'POST',
            url,  // Target Cloud Function endpoint
            oidcToken: {
                serviceAccountEmail: email,  // OIDC service account
                audience: url,               // Token audience (function URL)
            },
            headers: {
                'Content-Type': 'application/json',
            },
            body: payload  // Base64 encoded JSON payload
        },
        scheduleTime: {
            seconds: Math.floor(Date.now() / 1000) + delayInSeconds  // Execute after delay
        }
    };

    await client.createTask({ parent, task });  // Queue the task
}

// Main orchestrator: Read session → create sequential GPT analysis tasks
functions.http('batchprocessgpt', async(req, res) => {
    const { sessionId } = req.body;  // Session JSON filename from GCS
    const recipientEmail = process.env.EMAIL_GPT;  // Final report recipient (or "next")
    console.log("SESSION:", sessionId);
    
    try {
        // Read processed session data from GCS bucket
        const elements = await readJsonFileFromBucket('your-session-bucket', sessionId);
        
        let delayInSeconds = 0;           // First task executes immediately
        const totalElements = Object.keys(elements).length;  // Total companies to process
        let currentIndex = 0;
        
        // Create sequential Cloud Tasks for each company (30s spacing)
        for (const [website, data] of Object.entries(elements)) {
            currentIndex++;
            const isLastElement = currentIndex === totalElements;
            
            // Last company gets recipient email, others use "next" (pipeline chaining)
            let message = {};
            if (isLastElement) {
                message = {
                    website,
                    name: data.name,
                    text: data.text,
                    recipientEmail,      // Send final report
                    sessionId,
                };
            } else {
                message = {
                    website,
                    name: data.name,
                    text: data.text,
                    recipientEmail: "next",  // Continue pipeline
                    sessionId,
                };
            }

            // Queue task with progressive delay (0s, 30s, 60s, 90s...)
            await createTask(message, delayInSeconds);
            delayInSeconds += 30;  // 30 second intervals between tasks
        }

        // Estimated completion: ~45s per company (GPT processing time)
        res.json({ fulfillmentText: `Letters are processing, pls wait for ${totalElements * 0.75} minutes` });
    } catch (error) {
        console.log("ERROR:", error);
        res.status(500).send('Error creating tasks: ' + error.message);
    }
});

// GCS Storage client
const storage = new Storage();

// Download + parse session JSON directly from GCS (no local filesystem)
async function readJsonFileFromBucket(bucketName, fileName) {
    try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);           // Session file reference
        const contents = await file.download();       // Download raw buffer
        return JSON.parse(contents);                  // Parse JSON → object
    } catch (error) {
        console.error('Error reading JSON file from bucket:', error);
        throw error;
    }
}
