 
  // Save data using Chrome's storage API
  export function saveFile(data, name) {
    if (!data) {
      console.error("No data to save");
      return Promise.reject(new Error("No data to save"));
    }

    return new Promise((resolve, reject) => {
      // If data is a File or Blob, convert it to base64
      if (data instanceof Blob || data instanceof File) {
        const reader = new FileReader();
        reader.onload = function () {
          const base64Data = reader.result;
          // Store the data
          chrome.storage.local.set(
            {
              [name]: {
                content: base64Data,
                type: data.type,
                timestamp: new Date().getTime(),
              },
            },
            () => {
              if (chrome.runtime.lastError) {
                console.error("Error saving data:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
              } else {
                console.log(`Data "${name}" saved successfully`);
                resolve(name);
              }
            }
          );
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(data);
      } else {
        // If data is already a string or other format
        chrome.storage.local.set(
          {
            [name]: {
              content: data,
              timestamp: new Date().getTime(),
            },
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error("Error saving data:", chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              console.log(`Data "${name}" saved successfully`);
              resolve(name);
            }
          }
        );
      }
    });
  }

  // Read data using Chrome's storage API
  export function readFile(name) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(name, (result) => {
        if (chrome.runtime.lastError) {
          console.error("Error reading data:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else if (!result[name]) {
          reject(new Error(`No data found with name: ${name}`));
        } else {
          resolve(result[name]);
        }
      });
    });
  }

 
   