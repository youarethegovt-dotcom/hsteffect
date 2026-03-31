const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event) => {
  try {
    // 1. Initialize with the 2026 Client
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // 2. Switch to the Pro model (more stable for architectural references)
    const modelId = "gemini-3-pro-image-preview"; 

    const { imageBase64, mimeType } = JSON.parse(event.body);

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Transform this aerial photo into a minimalist site diagram.
      - Charcoal outlines for buildings.
      - Pale gray roads.
      - Tan railroad corridor.
      - Soft gray shadows on Southwest faces.
      - Remove all cars, trees, and red colors.`;

    // 3. Generate content using the 2026 structure
    const response = await ai.generateContent({
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

    // 4. Extract the image from the response
    const generatedPart = response.candidates[0].content.parts.find(p => p.inlineData);
    
    if (!generatedPart) {
      throw new Error("AI responded but did not generate an image. Check your API quota.");
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: generatedPart.inlineData.data }),
    };

  } catch (error) {
    // This sends the actual error message to your console/screen
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Unknown Server Error" }),
    };
  }
};
