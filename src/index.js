//============================================================
//File:        index.js
//Author:      Aryan Cyrus 33114242
//Created:     2026-03/18
//Description: Tech Spike for Google Vision OCR
//Version:     1.0
//NOTE: this file only works with API credentials stored in 2026W1Arkhive/credentials (which is unique for each person)


//Last Updated:2026-03-18 by Aryan Cyrus
//============================================================

//importing google visiob
const vision = require('@google-cloud/vision');
//crearubg new client using JSON credentials
const client = new vision.ImageAnnotatorClient({
    keyFilename: './credentials/arkhive-ocr-c9455fcc9903.json'
});

const imagePath = './assets/receipt.png';

async function main() {
    //Processing receipt using document text detection
    const response = await client.documentTextDetection(imagePath);
    //getting first element of response (which is a JSON with ALL the extracted information (e.g. text, confidence, location etc))
    const result = response[0];
    //getting full text from response 
    const fullText = result.fullTextAnnotation.text;
    //print results
    console.log(response[2]);
}

//running the asychronous function
main();

