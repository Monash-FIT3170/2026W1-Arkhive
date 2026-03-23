
//============================================================
//File:        gemini-start.js
//Author:      Aryan Cyrus 33114242
//Created:     2026-03/22
//Description: Tech Spike for Google Gemini LLM
//Version:     1.0
//Last Updated:2026-03-22 by Aryan Cyrus
//============================================================

//imports
import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'

//Configure .env file
dotenv.config();

//obtain API key from .env file
const API_KEY = process.env.API_KEY;
//initialise Google generative AI object
const genAI = new GoogleGenerativeAI(API_KEY)

//Function to run generative AI model
async function run() {
    //Generate AI model using google's "gemeni-pro" model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

    //provide a custom prompt for AI to respond to (feel free to experiment with different prompts)
    const prompt = "Briefly explain the concept of OCR and describe its uses"
    //feed prompts into gemeni-pro and get a result
    const result = await model.generateContent(prompt);
    //obtain actual response from result object
    const response = result.response;
    //turn response into text
    const text = response.text()
    //print response
    console.log(text)
}

run();