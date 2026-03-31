const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // This will force a log entry in the black window
  console.log("--- SYSTEM BOOT: ARCHITECTURAL DIAGRAMMER ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Updated to the 2026 stable Flash model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const { imageBase64, mimeType } = JSON.parse(event.body);
    console.log("Input validated. Image size:", Math.round(imageBase64.length / 1024), "KB");

    const prompt = `Minimalist architectural site diagram. 
      STYLE: Charcoal lines, pale gray roads, tan railroads, southwest-facing shadows. 
      EXCLUSIONS: No trees, no cars, no red.`;

    console.log("Contacting Google AI Cluster...");
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      },
      { text: prompt }
    ]);

    const response = await result.response;
    const part = response.candidates[0].content.parts.find(p => p.inlineData);

    if (!part) {
      console.error("AI Error: Text returned instead of image.");
      return { statusCode: 500, body: JSON.stringify({ error: "AI failed to generate image." }) };
    }

    console.log("Success! Sending diagram to Nashville...");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: part.inlineData.data }),
    };

  } catch (error) {
    // This logs the SPECIFIC reason for failure in your black window
    console.error("CRITICAL ENGINE ERROR:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
