//============================================================
//File:        index.js
//Author:      Aryan Cyrus 33114242
//Created:     2026-03/18
//Description: Tech Spike for Google Vision OCR
//Version:     1.0
//Last Updated:2026-03-22 by Aryan Cyrus
//============================================================

//importing google visiob
import vision from '@google-cloud/vision';
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
    console.log(fullText);
    //Uncomment this if you want to see the WHOLE output JSON
    //console.log(JSON.stringify(result, null, 2));

}

//running the asychronous function
main();
