const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event) => {
  console.log("--- STARTING SITE ANALYSIS: NASHVILLE ENGINE ---");

  try {
    // 1. Initialize the 2026 Client
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const modelId = "gemini-3-flash-preview";

    const { imageBase64, mimeType } = JSON.parse(event.body);
    console.log("Image received and parsed.");

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a minimalist site diagram.
      - Use heavy charcoal outlines for building footprints.
      - Use pale gray for roads and sidewalks.
      - Use a tan/orange wash for the railroad corridor.
      - Apply soft gray shadows strictly to the southwest faces of buildings.
      - EXCLUDE: No trees, no cars, and NO red colors.`;

    console.log(`Sending request to ${modelId} via 2026 SDK...`);
    
    // 2. The 2026 request structure
    const response = await client.models.generateContent({
      model: modelId,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { data: imageBase64, mimeType: mimeType } }
          ]
        }
      ]
    });

    // 3. Extract the image from the new response format
    const part = response.candidates[0].content.parts.find(p => p.inlineData);

    if (!part) {
      console.warn("AI returned text but no image.");
      throw new Error("The AI didn't generate an image part.");
    }

    console.log("Success! Diagram generated.");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: part.inlineData.data }),
    };

  } catch (error) {
    // This will now catch the ACTUAL error if it persists
    console.error("DIAGNOSTIC ERROR:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
