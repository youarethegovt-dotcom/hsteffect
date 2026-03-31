exports.handler = async (event) => {
  console.log("--- HEARTBEAT RECEIVED ---");
  console.log("Request Body exists:", !!event.body);

  return {
    statusCode: 200,
    body: JSON.stringify({ 
      image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", // A tiny blank pixel
      message: "Connection Successful!" 
    }),
  };
};
