const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // We'll use the stable version of the image model
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image" });

    const { imageBase64, mimeType } = JSON.parse(event.body);

    const prompt = `Convert this aerial photo into a minimalist architectural site diagram. 
      Style: Charcoal line weights, pale gray roads, tan railroads, and southwest shadows. 
      No trees, no cars, no red.`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      },
      { text: prompt }
    ]);

    // Added a check to make sure the AI actually sent back an image
    const response = await result.response;
    const part = response.candidates[0].content.parts[0];
    
    if (!part.inlineData) {
      throw new Error("AI returned text instead of an image. Check your prompt.");
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: part.inlineData.data }),
    };

  } catch (error) {
    console.error("DEBUG ERROR:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
