function submitSignIn() {
  setTimeout(() => {
    const btnSubmit = document.getElementById("submit");
    if (!btnSubmit) {
      alert("No se encontró el botón de enviar");
      return;
    }
    btnSubmit.click();
  }, 500);
}

function readFile(name) {
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

function base64ToFile(base64, filename, mimeType) {
  const byteCharacters = atob(base64.split(",")[1]); // Decode Base64
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], filename, { type: mimeType });
}

function findElementByText(text) {
  const elements = document.querySelectorAll("*"); // Select all elements
  return Array.from(elements).find((el) => el.textContent.trim() === text);
}

function waitForText(searchText, callback, timeout = 10000, interval = 100) {
  const startTime = Date.now();
  console.log('Searching for text:', searchText);
  const checkForText = () => {
      // Search for the text in the DOM
      const elements = Array.from(document.querySelectorAll('*')).filter(element => 
          element.textContent.includes(searchText)
      );

      if (elements.length > 0) {
          // Text found
          console.log('Text found:', searchText);
          callback(elements[0]);
          return;
      }

      // Check if timeout has been reached
      if (Date.now() - startTime >= timeout) {
          console.log('Timeout reached: Text not found');
          return;
      }

      // Try again after interval
      setTimeout(checkForText, interval);
  };

  checkForText();
}

async function setUpValueFromStorage(input, key) {
  try {
    chrome.storage.local.get([key], function (result) {
      if (result[key]) {
        setUpValue(input, result[key]);
        return Promise.resolve();
      }
    });
  }
   catch (e) {
    console.log("Error setting up value from storage:", e);
    return Promise.resolve("");
  }
}

async function setUpFile(filename, input) {
  try {
    readFile(filename)
      .then((data) => {
        if (!data.content) {
          throw new Error("No se encontró el archivo");
        }
        const inputHTML = document.getElementById(input);
        const file = base64ToFile(data.content, filename, data.type);
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        inputHTML.files = dataTransfer.files;
        inputHTML.dispatchEvent(new Event("change"));
      })
      .catch((e) => {
        console.log("Error setup file", e);
        //alert("No se encontró el archivo del certificado");
      });
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
  }
}

function setUpValue(input, value) {
  const inputText = document.getElementById(input);
  inputText.value = value;
}

//==============================================================================
//PROCESO DE LLENADO DE LA FIRMA
//==============================================================================



async function initData(){
  await setUpFile("certificado.cer", "fileCertificate");
  await setUpFile("llave.key", "filePrivateKey");
  setUpValue("txtPrivateKey", "llave.key");
  setUpValue("txtCertificate", "certificado.cer");
  await setUpValueFromStorage("privateKeyPassword", "passwordCertificado");
  submitSignIn();
  return;
}

try {
  if (findElementByText("Acceso por contraseña")) {
    const btnFiel = document.getElementById("buttonFiel");
    btnFiel.click();
  }
  else if (findElementByText("Acceso con e.firma")) {
    
    initData().then(x => {
      document.body.style.backgroundColor = "#93E9BE";
    }).catch(e =>{
      document.body.style.backgroundColor = "#FCB7B0";
      console.log("Error importing modules:", e);
    });
  }
 
  
} catch (err) {
  console.log("Error importing modules:", err);
  document.body.style.backgroundColor = "#FCB7B0";
}
