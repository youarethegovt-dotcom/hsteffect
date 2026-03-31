const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  console.log("--- SYSTEM BOOT: ARCHITECTURAL DIAGRAMMER ---");

  try {
    // 1. Initialize the AI with the explicit version
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // 2. Using gemini-2.0-flash (The 2026 stable workhorse)
    // If you see a 404 again, try "gemini-1.5-flash-latest" here.
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      apiVersion: "v1beta" // This often fixes the 404 Not Found issue
    });

    const { imageBase64, mimeType } = JSON.parse(event.body);
    console.log("Input received. Preparing site diagram...");

    const prompt = `Convert this aerial photo into a minimalist architectural site diagram. 
      STYLE: Charcoal outlines for buildings, pale gray for roads, tan for railroads. 
      Apply gray shading to the southwest faces for 3D depth. 
      EXCLUDE: No trees, no cars, no red.`;

    console.log("Contacting Google AI Cluster...");
    
    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const part = response.candidates[0].content.parts.find(p => p.inlineData);

    if (!part) {
      throw new Error("AI returned text instead of a diagram. Check safety settings.");
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
