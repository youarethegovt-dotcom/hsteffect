const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  console.log("--- INITIALIZING ARCHITECTURAL ENGINE ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // UPDATED FOR 2026: Using the core Gemini 3 model
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });

    const { imageBase64, mimeType } = JSON.parse(event.body);
    console.log("Image received. Type:", mimeType);

    const prompt = `Convert this aerial photo into a minimalist architectural site diagram. 
      STYLE: Heavy charcoal building footprints, pale gray roads, tan railroad corridor. 
      SHADING: Apply gray shading to the southwest faces for 3D depth.
      EXCLUDE: No trees, no cars, no red.`;

    console.log("Sending request to Gemini...");
    
    // The 2026 models are extremely fast—this should take ~5 seconds
    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    
    // In 2026, Flash can output images directly in the response parts
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);

    if (!imagePart) {
      console.warn("AI returned text but no image. Lee, check your prompt/settings.");
      throw new Error("The AI didn't generate an image part.");
    }

    console.log("Diagram generated. Sending to client...");

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
