const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- STARTING DYNAMIC VECTOR ENGINE ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel(
      { model: "gemini-3.1-flash-image-preview" },
      { apiVersion: "v1beta" }
    );

    // Now we capture the customInstructions from the frontend
    const { imageBase64, mimeType, customInstructions } = JSON.parse(event.body);

    // We build the prompt using YOUR instructions
    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      TASK: Convert this aerial photo into a high-quality site diagram.
      
      PRIMARY STYLE INSTRUCTIONS: 
      ${customInstructions || "Minimalist charcoal site plan with bold footprints and gray roads."}
      
      TECHNICAL REQUIREMENTS:
      - High contrast for vectorization.
      - Clean boundaries between shapes.
      - No photographic textures, no trees, no cars.`;

    console.log("Sending to Gemini with Custom Specs...");
    
    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);
    const pngBase64 = imagePart.inlineData.data;

    console.log("Vectorizing result...");
    const imgBuffer = Buffer.from(pngBase64, 'base64');
    
    const svgData = await new Promise((resolve, reject) => {
      potrace.trace(imgBuffer, { threshold: 128 }, (err, svg) => {
        if (err) reject(err);
        resolve(svg);
      });
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: pngBase64, 
        svg: Buffer.from(svgData).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("ENGINE ERROR:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
