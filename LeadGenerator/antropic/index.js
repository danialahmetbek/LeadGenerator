import functions from '@google-cloud/functions-framework';
import Anthropic from '@anthropic-ai/sdk';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import axios from 'axios';
import iconv from 'iconv-lite';

// Claude 3.5 Sonnet API key (Anthropic)
const apiKey = process.env.API_KEY; // API KEY for sonnet

// Final stage: Generate personalized proposals + trigger email sending
functions.http('sonnetlayer', async(req, res) => {
    console.log("BODY:", req.body);
    try {
        const { sessionId, websiteCheck } = req.body;  // Session ID + target website
        
        // Load existing session data from GCS
        const dataOld = await downloadJsonFile('leadcompany', sessionId, sessionId);
        console.log("DATAOLD:", dataOld);
        
        res.json({ fulfillmentText: "I am sending the letters" });
        
        let data = {};
        let temp = {};
        
        // Normalize website URL (strip protocol for lookup)
        const normalizedWebsite = websiteCheck.replace(/^https?:\/\//, '');
        const httpWebsite = `http://${normalizedWebsite}`;
        const httpsWebsite = `https://${normalizedWebsite}`;
        let website = "";
        
        // Find matching website in session data (http vs https)
        if (dataOld.hasOwnProperty(httpWebsite)) {
            website = httpWebsite;
        } else if (dataOld.hasOwnProperty(httpsWebsite)) {
            website = httpsWebsite;
        } else {
            return;  // Skip if website not found
        }
        
        const analysis = dataOld[website].text;  // GPT analysis + reviews
        console.log("WEBSITE:", website);
        console.log("ANALYSIS:", analysis);
        
        // Detailed Claude prompt: Generate personalized UAE relocation proposal
        const prompt = `Objective:
Craft a personalized service proposal for a potential client based on the strengths and weaknesses identified from their website and customer reviews. Convince the client that "YOUR_PROJECT_NAME" services are the optimal solution for their current needs. Do not include "I hope this letter finds you well." It is crucial to write "YOUR_PROJECT_NAME", starting with small letter.

[... full detailed prompt unchanged ...]`;

        console.log(analysis);

        // Claude Sonnet → personalized proposal letter
        const response = iconv.encode(await getResponse(prompt), 'utf-8').toString();
        console.log("RESPONSE:", prompt);
        
        // Store generated letter in session data
        temp = {
            "name": dataOld[website].name,
            "text": response,           // Generated proposal letter
            "email": dataOld[website].email,
            "probability": dataOld[website].probability
        };
        data[website] = temp;

        // Create/update letters session file (sessionId-letters.json)
        const { name, ext } = path.parse(sessionId);
        const newFileName = `${name}-letters${ext}`;
        const tempFilePath = path.join(process.cwd(), newFileName);
        
        const check = await checkIfFileExists('leadcompany', newFileName);
        if (!check) {
            await writeTemp(data, newFileName, tempFilePath);  // Create new letters file
        } else {
            // Append to existing letters file
            const dataFin = await downloadJsonFile('leadcompany', newFileName, newFileName);
            dataFin[website] = temp;
            await writeTemp(dataFin, newFileName, tempFilePath);
        }
        
        console.log("SESSIONID", newFileName, sessionId);
        console.log("EMAILS:", dataOld[website].email);
        
        // Send personalized proposal to each email address (15s delay between sends)
        for (const em of dataOld[website].email) {
            console.log(em);
            await axios.post('http://localhost:3000/sendLetters', { // Trigger email service
                email: em,
                text: response  // Personalized proposal letter
            });
            await new Promise(resolve => setTimeout(resolve, 15000));  // Rate limiting
        }
    } catch (error) {
        console.log("ERROR:", error);
    }
});

// Claude 3.5 Sonnet: Generate personalized proposal letter
const anthropic = new Anthropic({
    apiKey: apiKey
});

async function getResponse(prompt) {
    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",  // Latest Sonnet model
        max_tokens: 2048,
        system: "Write only subject and letter, nothing else.",  // Strict output format
        messages: [
            { "role": "user", "content": prompt }
        ]
    });
    console.log("RESPONSE:", response);
    return response.content[0].text;  // Extract generated letter text
}

// GCS Storage client
const storage = new Storage();

// Download session JSON from GCS → local filesystem → parse
async function downloadJsonFile(bucketName, srcFilename, destFilename) {
    const options = {
        destination: destFilename,
    };

    await storage.bucket(bucketName).file(srcFilename).download(options);

    console.log(`gs://${bucketName}/${srcFilename} downloaded to ${destFilename}.`);

    const rawdata = fs.readFileSync(destFilename);
    return JSON.parse(rawdata);
}

// Write letters session → local temp → upload to GCS
async function writeTemp(sessions, fileName, tempFilePath) {
    try {
        fs.writeFileSync(tempFilePath, JSON.stringify(sessions, null, 2));
        console.log("Wrote sessions:", JSON.stringify(sessions, null, 2));
        await uploadFile(fileName, tempFilePath);
    } catch (err) {
        console.error('Error writing sessions:', err);
    }
}

const bucketName = "leadcompany";  // Session storage bucket

// Upload local letters file → GCS bucket
async function uploadFile(fileName, tempFilePath) {
    try {
        await storage.bucket(bucketName).upload(tempFilePath, {
            destination: fileName,
        });
        console.log(`${fileName} uploaded to ${bucketName}`);
    } catch (err) {
        console.error('Error uploading file:', err);
    }
}

// Check if letters session file already exists in GCS
async function checkIfFileExists(bucketName, fileName) {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    try {
        const [exists] = await file.exists();
        if (exists) {
            console.log(`File ${fileName} exists in bucket ${bucketName}.`);
            return true;
        } else {
            console.log(`File ${fileName} does not exist in bucket ${bucketName}.`);
            return false;
        }
    } catch (error) {
        console.error('Error checking if file exists:', error);
    }
}
