import functions from '@google-cloud/functions-framework';
import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import OpenAI from "openai";
import { analyzeWebsite, getBaseUrl, getText } from './scrap.js';

// External scraping utilities (website → structured text)
const apiKey = process.env.API_KEY;
const openai = new OpenAI({
    apiKey: apiKey
});

// GPT-4o-mini: Extract contacts + probability from website/reviews with JSON output
async function useGpt4o(prompt) {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { "type": "json_object" },
            temperature: 0.2,
            max_tokens: 4000,
            top_p: 0.8,
            frequency_penalty: 0.5,
            presence_penalty: 0.5,
            n: 1,
            messages: [{
                    role: 'system',
                    content: `You are a marketer. Create JSON file in format: 
                    {
                        emails: array(if there is no email, leave it empty),
                        phone: string(format it, if there is no phone number, put Not Found),
                        socialMedia: array(list of the links, if there is no links, leave it empty),
                        probability: number(in %), 
                        analysis: string(make the text readible)
                    }. Analysis must be detailed and follow the instruction. Do not make up infromation`
                },
                { role: 'user', content: prompt }
            ],
        }, );
        console.log("RESPONSE:", response.choices[0].message.content)
        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Main GPT layer: Analyze individual company (scraping → GPT → store → optional email report)
functions.http('gptlayer', async(req, res) => {
    console.log(req.body);
    try {
        const nameFile = req.body.sessionId; // Session JSON filename in GCS
        const senderEmail = process.env.SENDER_EMAIL; // Email sender (proposals)
        const senderPassword = process.env.SENDER_APP_PASSWORD; // Gmail app password
        const recipientEmail = req.body.recipientEmail; // Report recipient
        const name = req.body.name; // Company name
        const website = req.body.website; // Company website URL
        const baseURL = await getBaseUrl(website); // Clean base domain
        const websiteText = await analyzeWebsite(baseURL); // Scraped website content

        const text = req.body.text; // Google Place reviews
        const prompt = `[...PROMPT...]` // Full UAE lead scoring prompt (business logic)`


        // GPT analysis → structured contacts + probability score
        const response = await useGpt4o(prompt);

        // Load session → update company record → save back to GCS
        let data = await downloadJsonFile('your-session-bucket', nameFile, nameFile);
        const temp = {
            name: name,
            phone: response.phone,
            socialMedia: response.socialMedia,
            probability: response.probability,
            email: response.emails,
            text: response.analysis
        }
        console.log("TEMP:", temp)
        data[website] = temp;
        console.log("DATA", data)
        await writeTemp(data, nameFile);

        res.sendStatus(200);

        // Optional pipeline completion: Email report + trigger Antropic tasks
        if (recipientEmail != "next") {
            await new Promise(resolve => setTimeout(resolve, 45000)); // Wait for batch completion
            let dataFin = await downloadJsonFile('your-session-bucket', nameFile, nameFile);
            await sendJsonAsTextFile(dataFin, senderEmail, senderPassword, recipientEmail, nameFile.replace('.json', '.txt'));
            await new Promise(resolve => setTimeout(resolve, 30000));
            await axios.post('http://localhost:3000/BatchProcessAntropic', { // Next: Antropic task generation
                "sessionId": nameFile
            });
        }
    } catch (error) {
        console.error('Function error:', error);
        throw error;
    }
});

// GCS Storage client
const storage = new Storage();

// Download session JSON from GCS bucket → parse → return object
async function downloadJsonFile(bucketName, srcFilename, destFilename) {
    const options = {
        destination: destFilename,
    };

    await storage.bucket(bucketName).file(srcFilename).download(options);

    console.log(`gs://${bucketName}/${srcFilename} downloaded to ${destFilename}.`);

    const rawdata = fs.readFileSync(destFilename);
    const jsonData = JSON.parse(rawdata);
    return jsonData;
}

// GCS paths and session persistence
const bucketName = "your-session-bucket";
const tempFilePath = path.join(process.cwd(), 'temp.json');

// Write updated session → upload to GCS
async function writeTemp(sessions, fileName) {
    try {
        fs.writeFileSync(tempFilePath, JSON.stringify(sessions, null, 2));
        console.log("Wrote sessions:", JSON.stringify(sessions, null, 2));
        await uploadFile(fileName);
    } catch (err) {
        console.error('Error writing sessions:', err);
    }
}

// Upload local temp.json → GCS session file
async function uploadFile(fileName) {
    try {
        await storage.bucket(bucketName).upload(tempFilePath, {
            destination: fileName,
        });
        console.log(`${fileName} uploaded to ${bucketName}`);
    } catch (err) {
        console.error('Error uploading file:', err);
    }
}

// Convert session JSON → human-readable text report → email attachment
async function sendJsonAsTextFile(jsonData, senderEmail, senderPassword, recipientEmail, fileName) {
    // Filter companies with emails → format readable report
    function convertJsonToText(jsonData) {
        let textContent = '';
        for (const [url, details] of Object.entries(jsonData)) {
            if (jsonData[url].email) {
                textContent += `URL: ${url}\n`;
                textContent += `Name: ${details.name}\n`;
                textContent += `Text: ${details.text}\n\n`;
                textContent += "\n" + "_______________________________________________" + "\n";
            }
        }
        return textContent;
    }

    const textData = convertJsonToText(jsonData);
    fs.writeFileSync(fileName, textData, 'utf8');

    // Gmail transporter with timeouts
    const transporter = nodemailer.createTransporter({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: senderEmail,
            pass: senderPassword
        },
        connectionTimeout: 30000,
        socketTimeout: 30000
    });

    const mailOptions = {
        from: senderEmail,
        to: recipientEmail,
        subject: 'Analysis',
        text: 'Please find the attached text file',
        attachments: [{
            filename: fileName,
            path: `./${fileName}`
        }]
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
    } catch (error) {
        console.log(error);
    }
}