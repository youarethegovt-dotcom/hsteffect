const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // This should show up in the black window the MOMENT you click the button
  console.log("--- INITIALIZING ARCHITECTURAL ENGINE ---");

  try {
    // Check for the key immediately
    if (!process.env.GEMINI_API_KEY) {
      console.error("CRITICAL: GEMINI_API_KEY is not set in Netlify Environment Variables.");
      return { statusCode: 500, body: "API Key Missing" };
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const { imageBase64, mimeType } = JSON.parse(event.body);
    console.log("Image received. Type:", mimeType);

    const prompt = "Minimalist architectural site diagram. Charcoal lines, pale gray roads, tan railroads, southwest shadows. No trees, cars, or red.";

    console.log("Sending request to Gemini...");
    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const part = response.candidates[0].content.parts.find(p => p.inlineData);

    console.log("Response successful. Sending image back to Lee.");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: part.inlineData.data }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC ERROR:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
