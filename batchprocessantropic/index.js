import functions from '@google-cloud/functions-framework';
import { Storage } from '@google-cloud/storage';
import { CloudTasksClient } from '@google-cloud/tasks';
import { GoogleAuth } from 'google-auth-library';

// GCP Cloud Tasks + authentication clients
const client = new CloudTasksClient();
const auth = new GoogleAuth();

// Cloud Tasks configuration from environment variables
const project = process.env.PROJECT; // GCP Project ID
const location = process.env.LOCATION; // Cloud Tasks region
const queue = process.env.QUEUE; // Target queue name
const url = process.env.URL; // Target Cloud Function URL
const email = process.env.EMAIL; // GCP Service account email

// Queue delayed HTTP task to target Cloud Function (rate-limited)
async function createTask(element, delayInSeconds) {
    const parent = client.queuePath(project, location, queue); // Full queue path
    const payload = Buffer.from(JSON.stringify(element)).toString('base64'); // Base64 payload

    const headers = {
        'Content-Type': 'application/json'
    };

    // Generate OAuth2 access token for Cloud Function invocation
    const authClient = await auth.getClient();
    const tokenResponse = await authClient.getAccessToken();
    const token = tokenResponse.token;
    headers['Authorization'] = `Bearer ${token}`;

    const task = {
        httpRequest: {
            httpMethod: 'POST',
            url, // Target processor function
            oidcToken: {
                serviceAccountEmail: email, // Service account for OIDC auth
                audience: url, // Token audience validation
            },
            headers: {
                'Content-Type': 'application/json',
            },
            body: payload // Base64 encoded JSON message
        },
        scheduleTime: {
            seconds: Math.floor(Date.now() / 1000) + delayInSeconds // Scheduled execution time
        }
    };

    await client.createTask({ parent, task }); // Add task to queue
}

// Filter + queue high-probability leads for Antropic processing (50%+ threshold)
functions.http('batchprocessantropic', async(req, res) => {
    const { sessionId } = req.body; // Session JSON filename
    const threshold = 50; // Minimum probability threshold (50%)
    console.log(req.body);

    // Load processed session data from GCS
    const details = await readJsonFileFromBucket('your-session-bucket', sessionId);

    try {
        let delayInSeconds = 0; // Progressive delay for rate limiting

        // Filter companies: probability ≥ 50% AND has emails
        for (const [website, data] of Object.entries(details)) {
            if (parseProbability(data.probability) < parseInt(threshold, 10)) {
                continue; // Skip low-probability leads
            }

            // Only process companies with verified email arrays
            if (data.email && Array.isArray(data.email) && data.email.length > 0) {
                const message = {
                    sessionId, // Track session context
                    websiteCheck: website // Target website for Antropic processing
                };

                // Queue task with 60s intervals (rate limiting)
                await createTask(message, delayInSeconds);
                delayInSeconds += 60; // Next task executes 60s later
            }
        }

        res.json({ fulfillmentText: "Alasysis is processing, pls wait" });
    } catch (error) {
        console.log("ERROR:", error);
        res.status(500).send('Error creating tasks: ' + error.message);
    }
});

// GCS Storage client
const storage = new Storage();

// Download + parse session JSON directly from GCS bucket (memory buffer)
async function readJsonFileFromBucket(bucketName, fileName) {
    try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName); // Session file reference
        const contents = await file.download(); // Download as Buffer
        return JSON.parse(contents); // Parse → JavaScript object
    } catch (error) {
        console.error('Error reading JSON file from bucket:', error);
        throw error;
    }
}

// Parse probability percentage string → integer (handles "75%", "75", etc.)
function parseProbability(value) {
    // Remove % sign + whitespace → parse as integer
    return parseInt(String(value).replace('%', '').trim(), 10);
}