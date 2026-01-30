import axios from 'axios';
import { URL } from 'url';
import { convert } from 'html-to-text';
import https from 'https';
import * as cheerio from 'cheerio';

// Disable SSL certificate validation (handles self-signed HTTPS certs)
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

// Extract readable plain text from HTML webpage (for GPT analysis)
export async function getText(url) {
    try {
        console.log("STARTED:", url);
        const response = await axios.get(url, {
            httpsAgent, // Bypass SSL errors
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', // Mimic Chrome browser
                'Accept-Language': 'en-US,en;q=0.9', // English preference
                'Referer': 'https://www.google.com' // Anti-bot protection
            }
        });
        const text = await convert(response.data); // Convert HTML → clean plain text
        console.log("TEXT:", text);
        return text; // Return readable text content
    } catch (error) {
        console.error(`Err fetching the page: ${error.message}`);
        return ''; // Graceful fallback
    }
};

// Internal helper: Fetch HTML + parse with Cheerio
async function fetchPage(url) {
    try {
        const response = await axios.get(url, { httpsAgent });
        return cheerio.load(response.data); // $ selector object for DOM queries
    } catch (error) {
        console.error(`Error fetching the page: ${error.message}`);
        return cheerio.load(''); // Empty DOM on failure
    }
};

// Recursive web crawler: Extract text from homepage + contact pages
export async function analyzeWebsite(url) {
    const visitedUrls = new Set(); // Prevent infinite loops + revisits
    const text = new Set(); // Deduplicate text content across pages

    // DFS crawler: prioritize contact pages + email links
    async function scrapePage(currentUrl) {
        if (visitedUrls.has(currentUrl)) return; // Already visited
        visitedUrls.add(currentUrl);

        try {
            const $ = await fetchPage(currentUrl); // Parse current page DOM

            const temp = await getText(currentUrl); // Extract readable text
            text.add(temp); // Deduplicate across pages

            // Target contact pages + email links (lead generation focus)
            const links = $('a[href]')
                .map((index, element) => $(element).attr('href')) // All hyperlinks
                .get()
                .filter(link => link.includes('contact') || link.includes('mailto:')); // Contact + email focus

            // Recursively crawl promising links
            for (const link of links) {
                let absoluteUrl;
                try {
                    absoluteUrl = new URL(link, currentUrl).href; // Resolve relative URLs
                } catch (error) {
                    // Skip malformed URLs
                    continue;
                }

                if (!visitedUrls.has(absoluteUrl)) {
                    await scrapePage(absoluteUrl); // Recursive crawl
                }
            }
        } catch (error) {
            console.error(`Error fetching the URL: ${error.message}`);
        }
    }

    await scrapePage(url); // Start from given URL (usually homepage)
    console.log(text);
    return Array.from(text); // Array of unique text chunks for GPT context
}

// Extract clean base domain from any valid URL
export async function getBaseUrl(givenUrl) {
    const parsedUrl = new URL(givenUrl);
    console.log(`URL:, ${parsedUrl.protocol}//${parsedUrl.host}`);
    return `${parsedUrl.protocol}//${parsedUrl.host}`; // protocol + domain only (no path)
}