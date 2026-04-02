const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");

exports.handler = async (event) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel(
      { model: "gemini-3.1-flash-image-preview" },
      { apiVersion: "v1beta" }
    );

    const { imageBase64, mimeType, customInstructions } = JSON.parse(event.body);

    // YOUR NEW DEFAULT STYLE LIVES HERE:
    const defaultStyle = ".25mm dark charcoal outline around all buildings, .1mm thin gray lines for all of the building forms, roads to be a lighter gray tone, water represented with pale light blue, white masses for buildings with gray shade for the sides of the buildings in shadow, not overly detailed, no text.";

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      TASK: Convert this aerial photo into a high-quality site diagram.
      
      PRIMARY STYLE INSTRUCTIONS: 
      ${customInstructions || defaultStyle}
      
      TECHNICAL REQUIREMENTS:
      - High contrast for vectorization.
      - Clean boundaries between shapes.
      - No photographic textures, no trees, no cars.`;

    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);
    const pngBase64 = imagePart.inlineData.data;

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
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
