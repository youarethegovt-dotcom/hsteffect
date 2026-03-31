const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // Clearer logging for the black window
  console.log("--- STARTING SITE ANALYSIS ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Use the 1.5 Flash model - it is significantly faster for diagrams 
    // and less likely to time out than the 3.1 Pro models.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const { imageBase64, mimeType } = JSON.parse(event.body);

    const prompt = "Minimalist architectural site diagram. Charcoal lines, pale gray roads, tan railroads, southwest shadows. No trees, cars, or red.";

    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const text = response.text(); 
    
    // Note: If the model returns text instead of an image, 
    // we need to handle that. Most API versions for Flash return 
    // the image as a generated part.
    const part = response.candidates[0].content.parts.find(p => p.inlineData);

    return {
      statusCode: 200,
      body: JSON.stringify({ image: part.inlineData.data }),
    };

  } catch (error) {
    console.error("LOGGED ERROR:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
