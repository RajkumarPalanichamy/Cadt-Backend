require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require("cors");
const multer = require('multer');
const cloudinary = require('./cloudinary');
const authenticateToken = require('./Authication');
const MainArrayModel = require('./Schema/DynamicScene')

const Texture = require("./Schema/texture")




const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.MONGODB_URI;
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
   .then(() => console.log("MongoDB Connected"))
   .catch(err => console.log("MongoDB Connection Error:", err));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });





// User Schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String
});
const Admins = mongoose.model('Clients', userSchema);


// Furniture Schema
const furnitureSchema = new mongoose.Schema({
  modelType: String,
  category: String,  
  FurnituresImagesArraywithGltf: [
    {
      furnitureName: String,
      furnitureImage: String,       
      furnitureGltfLoader: String,  
    },
  ],
});

const Furniture = mongoose.model('Furniture', furnitureSchema);




// Login API //  1
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const dbResponse = await Admins.findOne({ username });
    if (!dbResponse) {
      return res.status(400).json({ error: "Invalid user" });
    }

    if (password !== dbResponse.password) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Include both username and role in the token
    const user = { name: username, role: dbResponse.role };
    const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN);

    const userCollectionName = `user_${username}_data`;

    const userDataSchema = new mongoose.Schema({
      modelType: String,
      category: String,
      FurnituresImagesArraywithGltf: [
        {
          furnitureName: String,
          furnitureImage: String,
          furnitureGltfLoader: String
        }
      ]
    });

    const UserCollection = mongoose.models[userCollectionName] || mongoose.model(userCollectionName, userDataSchema);

    if (!mongoose.connection.collections[userCollectionName]) {
      await UserCollection.createCollection();
      console.log(`Created collection for user: ${userCollectionName}`);
    }

    return res.status(200).json({ accessToken, message: "Login successful, navigating to home..." });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).send("Server Error!");
  }
});



// Register API //  2
app.post("/register", async (req, res) => {
  const { username, password, role } = req.body;
  
  try {

    const dbResponse = await Admins.findOne({ username });
    if (dbResponse) {
      return res.status(400).json({ error: "User Already Registered" });
    }


    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be greater than six characters" });
    }

 
    const user = { name: username, role };
    const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN);
    console.log(accessToken)

    const newUser = new Admins({ username, password, role });
    await newUser.save();

    return res.status(200).json({ accessToken });
  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).send("Server Error!");
  }
});


// Get Users By Admin // 3 
app.get("/clients", async (req, res) => {
  try {
    const users = await Admins.find({});
    res.send(users);
  } catch (error) {
    console.error("Get Users Error:", error);
    res.status(500).send("Server Error!");
  }
});

// Delete User By Admin  // 4
app.delete("/clients/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedUser = await Admins.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).send("User not found!");
    }
    res.send("User deleted successfully!");
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).send("Server Error!");
  }
});

// Update User By Admin // 5
app.put("/modifyclients/:id", async (req, res) => {
  const { id } = req.params;
  const { name, password} = req.body; 
  try {
    const updatedUser = await Admins.findByIdAndUpdate(
      id,
      { name, password },
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).send("User not found!");
    }
    res.send(updatedUser);
  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).send("Server Error!");
  }
});




// post of models // 6
app.post('/furnitures', authenticateToken, upload.fields([
  { name: 'furnitureGltfLoaderFiles' }, 
  { name: 'furnitureImageFiles' }
]), async (req, res) => {
  try {
    const { name: username } = req.user || {};
    if (!username) {
      return res.status(400).json({ error: 'Invalid user' });
    }
   


    const userCollectionName = `user_${username}_data`;

    if (!req.files || !req.files.furnitureGltfLoaderFiles || req.files.furnitureGltfLoaderFiles.length === 0) {
      return res.status(400).json({ message: 'No GLTF files uploaded' });
    }

    const { modelType, category, FurnituresImagesArraywithGltf } = req.body.data
      ? JSON.parse(req.body.data)
      : {};

    if (!modelType || !category || !FurnituresImagesArraywithGltf) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    const processedFurnitures = await Promise.all(
      FurnituresImagesArraywithGltf.map(async (item, index) => {
        const gltfFileContent = req.files.furnitureGltfLoaderFiles[index].buffer;
        const imageFileContent = req.files.furnitureImageFiles[index].buffer;
        const gltfFileName = `${Date.now()}-${req.files.furnitureGltfLoaderFiles[index].originalname}`;
        const imageFileName = `${Date.now()}-${req.files.furnitureImageFiles[index].originalname}`;

        const glbResponse = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { resource_type: 'raw', public_id: gltfFileName },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(gltfFileContent);
        });

        const imageResponse = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { resource_type: 'image', public_id: imageFileName },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(imageFileContent);
        });

        return {
          furnitureName: item.furnitureName,
          furnitureImage: imageResponse.secure_url,
          furnitureGltfLoader: glbResponse.secure_url,
        };
      })
    );

    const UserCollection = mongoose.models[userCollectionName] || mongoose.model(userCollectionName, userFurnitureSchema);
    const newFurnitureData = new UserCollection({
      modelType,
      category,
      FurnituresImagesArraywithGltf: processedFurnitures,
    });

    const savedFurniture = await newFurnitureData.save();
    res.status(201).json({ message: 'Furniture saved successfully', data: savedFurniture });
  } catch (error) {
    console.error("Error saving furniture data:", error);
    res.status(500).json({ message: 'Error saving furniture data', error });
  }
});



/// get Common Projects // 7
app.get('/commonprojects',  authenticateToken,async (req, res) => {
  try {
    
    const commonCollectionName = `furniture_data`;
    
    
    const FurnitureData = mongoose.models[commonCollectionName] || mongoose.model(commonCollectionName, new mongoose.Schema({
      userId: String,
      userCollectionId: mongoose.Schema.Types.ObjectId
    }));

    
    const references = await FurnitureData.find({});


    const furnitureDataWithNames = await Promise.all(
      references.map(async (ref) => {
        const userCollectionName = `user_${ref.userId}_data`;
        const UserCollection = mongoose.models[userCollectionName] || mongoose.model(userCollectionName, userFurnitureSchema);

        
        const userFurnitureData = await UserCollection.findById(ref.userCollectionId);

    
        if (userFurnitureData) {
          return {
            userId: ref.userId,
            furnitureName: userFurnitureData.furnitureName, 
            modelType: userFurnitureData.modelType,
            category: userFurnitureData.category,
            imagesAndModels: userFurnitureData.FurnituresImagesArraywithGltf, 
          };
        }
        return null; 
      })
    );

    
    const filteredFurnitureData = furnitureDataWithNames.filter(item => item !== null);

    res.status(200).json({ message: 'Furniture data retrieved successfully', data: filteredFurnitureData });
  } catch (error) {
    console.error("Error retrieving furniture data:", error);
    res.status(500).json({ message: 'Error retrieving furniture data', error });
  }
});








// Get Common  Furniture // 8
app.get("/getfurnitures",async (req, res) => {
  try {
    const furnitures = await Furniture.find({});
    res.status(200).json(furnitures);
  } catch (error) {
    console.error("Get Furniture Error:", error);
    res.status(500).json({ message: 'Error retrieving furniture data', error });
  }
});



const userFurnitureSchema = new mongoose.Schema({
  modelType: String,
  category: String,
  FurnituresImagesArraywithGltf: [
    {
      furnitureName: String,
      furnitureImage: String,
      furnitureGltfLoader: String
    }
  ]
});



/// get User Specific furniture  // 9

app.get('/userSpecificfurnitures', authenticateToken, async (req, res) => {
  try {
    const { name: username } = req.user || {};
    if (!username) {
      return res.status(400).json({ error: 'Invalid user' });
    }
    console.log("Username from token:", username);

  
    const userCollectionName = `user_${username}_data`;

    const UserCollection = mongoose.models[userCollectionName] || mongoose.model(userCollectionName, userFurnitureSchema);

  
    const furnitureData = await UserCollection.find();

    if (furnitureData.length === 0) {
      return res.status(404).json({ message: 'No furniture data found for this user' });
    }

    return res.status(200).json({ message: 'Furniture data retrieved successfully', data: furnitureData });
  } catch (error) {
    console.error("Error fetching furniture data:", error);
    res.status(500).json({ message: 'Error fetching furniture data', error });
  }
});






const sceneValueSchema = new mongoose.Schema({
  name: String,
  cordinates: [ 
    {
      x: Number,
      y: Number,
      z: Number
    }
  ]
});

const SceneValue = mongoose.model('SceneValue', sceneValueSchema);

/// API to Insert Default Values // 10
app.post('/defaultscene',async (req, res) => {
  try {
    const data = req.body.data;
    if (!Array.isArray(data)) {
      return res.status(400).json({ message: 'Data should be an array of objects' });
    }

    const formattedData = [
      {
        name: "Lcut",  
        cordinates: data 
      }
    ];

    await SceneValue.insertMany(formattedData);
    res.status(200).json({ message: 'Data stored successfully in sceneValue collection' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error storing data' });
  }
});

// api to store dynamic scence values // 11
app.post('/dynamicscene',async (req, res) => {
  try {
    const { projectName, coordinates, gltfObjects } = req.body; 
    const newDocument = new MainArrayModel({ projectName, coordinates, gltfObjects });
    const savedDocument = await newDocument.save();

    res.status(201).json({
      message: 'Data successfully added',
      data: savedDocument
    });

  } catch (error) {
    res.status(500).json({
      message: 'Error adding data',
      error: error.message
    });
  }
});




// Upadate the dynamuc Scenve Values // 12
app.put('/dynamicscene/edit', authenticateToken ,async (req, res) => {
  try {
    const { gltfLink, updatedCoordinates, updatedGltfLink, updatedGltfScene } = req.body;

    const document = await MainArrayModel.findOne();

    if (document) {

      if (updatedCoordinates) {
        document.coordinates = updatedCoordinates; 
      }

      const gltfObject = document.gltfObjects.find(obj => obj.gltfLink === gltfLink);
      if (gltfObject) {
        gltfObject.gltfLink = updatedGltfLink || gltfObject.gltfLink;
        gltfObject.gltfScene = updatedGltfScene || gltfObject.gltfScene;

      }

      const savedDocument = await document.save();
      res.status(200).json({
        message: 'Data successfully updated',
        data: savedDocument
      });
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (error) {
    res.status(500).json({
      message: 'Error updating data',
      error: error.message
    });
  }
});

// delete the dynamicScene Data  // 13
app.delete('/dynamicscene/:id',  authenticateToken ,async (req, res) => {
  try {
    const { id } = req.params; 
 
    const document = await MainArrayModel.findOne();

    if (document) {
    
      document.gltfObjects = document.gltfObjects.filter(item => item._id.toString() !== id);
      await document.save();

      res.status(200).json({ message: 'Item deleted successfully', document });
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item', message: error.message });
  }
});

// Endpoint to retrieve all items // 14
app.get('/getdynamicscene',async (req, res) => {
  try {
    const document = await MainArrayModel.find();
    res.status(200).json(document);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve data', message: error.message });
  }
});


/// Get Default scenes // 15
app.get('/defaultscenevalues' ,async (req, res) => {
  try {
   
    const data = await SceneValue.find();
    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving data' });
  }
});

/// Add Textures  // 16
app.post(
  "/textures",
  upload.fields([{ name: "Texturesfiles" }]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.Texturesfiles || req.files.Texturesfiles.length === 0) {
        return res.status(400).send("No files selected");
      }

      const { name, type } = req.body;
      if (!name || !type) {
        return res.status(400).send("Invalid Data Format");
      }

  
      const uploadToCloudinary = (fileBuffer) => {
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "textures" },
            (error, result) => {
              if (error) {
                reject(new Error("Cloudinary upload failed"));
              } else {
                resolve(result);
              }
            }
          );
          uploadStream.end(fileBuffer);
        });
      };

  
      const uploadedTextures = await Promise.all(
        req.files.Texturesfiles.map(async (file) => {
          const result = await uploadToCloudinary(file.buffer);
          return {
            url: result.secure_url,
          };
        })
      );


      const textureData = new Texture({
        name,
        type,
        textures: uploadedTextures,
      });

      await textureData.save();

      res.status(200).json({
        message: "Textures uploaded and saved successfully",
        data: textureData,
      });
    } catch (e) {
      console.error("Error uploading texture:", e);
      res.status(500).send("Server Error");
    }
  }
);


// get Textures // 17
app.get("/getTextures", async(req,res)=>{
  try{
    const textures = await Texture.find();
    res.status(200).send(textures)
  }
  catch(e){
    res.status(500).send("server Error!!!!...")
  }
})


// Start Server
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
