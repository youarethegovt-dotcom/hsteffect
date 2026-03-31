const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  console.log("--- STARTING SITE ANALYSIS: NASHVILLE ENGINE ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Using the exact model name found in your Google AI Studio
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview" 
    });

    const { imageBase64, mimeType } = JSON.parse(event.body);
    console.log("Image received and parsed.");

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a minimalist site diagram.
      - Use heavy charcoal outlines for building footprints.
      - Use pale gray for roads and sidewalks.
      - Use a tan/orange wash for the railroad corridor.
      - Apply soft gray shadows strictly to the southwest faces of buildings.
      - EXCLUDE: No trees, no cars, and NO red colors.`;

    console.log("Sending request to Gemini 3 Flash Preview...");
    
    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    
    // In the Gemini 3 series, we look for the image in the inlineData parts
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);

    if (!imagePart) {
      console.warn("AI returned text but no image part.");
      throw new Error("No image was generated. Try a simpler photo.");
    }

    console.log("Success! Diagram ready for download.");

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
