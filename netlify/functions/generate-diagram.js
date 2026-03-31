const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  console.log("--- STARTING SITE ANALYSIS: NASHVILLE ENGINE ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // THE FIX: We add the 'v1beta' version as a second argument here.
    // This tells the library to look in the correct folder for the preview model.
    const model = genAI.getGenerativeModel(
      { model: "gemini-3-flash-preview" },
      { apiVersion: "v1beta" } 
    );

    const { imageBase64, mimeType } = JSON.parse(event.body);
    console.log("Image received and parsed.");

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a minimalist site diagram.
      - Use heavy charcoal outlines for building footprints.
      - Use pale gray for roads and sidewalks.
      - Use a tan/orange wash for the railroad corridor.
      - Apply soft gray shadows strictly to the southwest faces of buildings.
      - EXCLUDE: No trees, no cars, and NO red colors.`;

    console.log("Sending request to Gemini 3 Flash Preview (v1beta)...");
    
    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);

    if (!imagePart) {
      console.warn("AI returned text but no image part.");
      throw new Error("No image was generated.");
    }

    console.log("Success! Diagram ready.");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imagePart.inlineData.data }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC ERROR:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
