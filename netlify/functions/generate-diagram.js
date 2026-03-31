const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event) => {
  console.log("--- STARTING SITE ANALYSIS: NASHVILLE ENGINE ---");

  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // THE FIX: Switch to the Image-specific model (Nano Banana 2)
    const modelId = "gemini-3.1-flash-image-preview"; 

    const { imageBase64, mimeType } = JSON.parse(event.body);
    console.log("Image received and parsed.");

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a minimalist site diagram.
      - Use heavy charcoal outlines for building footprints.
      - Use pale gray for roads and sidewalks.
      - Use a tan/orange wash for the railroad corridor.
      - Apply soft gray shadows strictly to the southwest faces of buildings.
      - EXCLUDE: No trees, no cars, and NO red colors.`;

    console.log(`Sending request to ${modelId}...`);
    
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
      ],
      // This config is crucial to force an image output
      config: {
        responseModalities: ["IMAGE"]
      }
    });

    const part = response.candidates[0].content.parts.find(p => p.inlineData);

    if (!part) {
      // If it still returns text, we can log it to see what it said
      console.warn("AI Response Text:", response.text()); 
      throw new Error("AI returned text instead of a diagram.");
    }

    console.log("Success! Diagram generated.");

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
