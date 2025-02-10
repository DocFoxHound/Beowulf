async function executeFunction(functionData, message, client, openai) {
  message.channel.sendTyping();  // Send typing indicator once we know we need to process
  //if the function is something that requires getting a list of users...
  switch (functionData.function.name) {
    case "piracy_advice_location":
        return piracy_advice_location(functionData);
    // Example of additional cases
    case "piracy_advice_commodity":
        return piracy_advice_location(functionData);
    
    case "yet_another_function_name":
        return yet_another_function_name(functionData);
  }
}

async function piracy_advice_location(functionData){
  // console.log(functionData.function.arguments)
  //TODO: get top commodities by sell rate
  //TODO: reference commodities and top sell locations
  //TODO: reference commodities and possible buy locations
  //TODO: return the information
  try {
    const jsonData = await fs.readFile("./UEX/", 'utf8'); // Read the file as a string
    const data = JSON.parse(jsonData); // Parse the string into JSON
    console.log(data); // Log or return the JSON data
    return data; // Optionally return the data for further processing
  } catch (error) {
      console.error('Failed to read or parse the JSON file:', error);
  }

}

module.exports = {
  executeFunction,
};
