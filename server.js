require("dotenv").config();
const multer = require("multer");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const File = require("./models/File");
const archiver = require("archiver");
const fs = require("fs");
const path = require("path");

const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: "uploads" });

mongoose.connect(process.env.DATABASE_URL);

app.set("view engine", "ejs");

app.get("/", (req, res) => {
  res.render("index");
});

// app.post("/upload", upload.array("file"), async (req, res) => {
//   try {
//     const filesData = [];
//     for (const file of req.files) {
//       const fileData = {
//         path: file.path,
//         originalName: file.originalname,
//       };
//       if (req.body.password != null && req.body.password !== "") {
//         fileData.password = await bcrypt.hash(req.body.password, 10);
//       }
//       filesData.push(fileData);
//     }
//     const files = await File.create(filesData);
//     res.render("index", {
//       fileLink: `${req.headers.origin}/file/${files
//         .map((f) => f.id)
//         .join(",")}`,
//     });
//   } catch (err) {
//     console.error("Error uploading files:", err);
//     res.status(500).send("Internal Server Error");
//   }
// });

/* To handle only single file upload */

// app.post("/upload", upload.single("file"), async (req, res) => {
//     const fileData = {
//       path: req.file.path,
//       originalName: req.file.originalname,
//     }
//     if (req.body.password != null && req.body.password !== "") {
//       fileData.password = await bcrypt.hash(req.body.password, 10)
//     }

//     const file = await File.create(fileData)

//     res.render("index", { fileLink: `${req.headers.origin}/file/${file.id}` })
// }
// )

const multiUploadDir = path.join(__dirname, 'multiupload');

if (!fs.existsSync(multiUploadDir)) {
  fs.mkdirSync(multiUploadDir);
}

/* To handle single and multiple file upload but the mutliple file is converted to zip and saved and then send the link for download */

app.post("/upload", upload.array("file"), async (req, res) => {
  try {
    const filesData = [];
    const files = req.files;
    if (files.length > 1) {
      const zipFileName = `${Date.now()}.zip`;
      const zipFilePath = path.join(multiUploadDir, zipFileName);
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('close', async () => {
        const fileData = {
          path: zipFilePath,
          originalName: zipFileName
        };
        if (req.body.password != null && req.body.password !== "") {
          fileData.password = await bcrypt.hash(req.body.password, 10);
        }
        filesData.push(fileData);
        const filesUploaded = await File.create(filesData);
        res.render("index", { fileLink: `${req.headers.origin}/file/${filesUploaded.map(f => f.id).join(',')}` });
      });

      archive.on('error', (err) => {
        throw err;
      });

      archive.pipe(output);

      files.forEach((file) => {
        archive.append(fs.createReadStream(file.path), { name: file.originalname });
      });

      archive.finalize();
    } else {
      for (const file of files) {
        const fileData = {
          path: file.path,
          originalName: file.originalname,
        };
        if (req.body.password != null && req.body.password !== "") {
          fileData.password = await bcrypt.hash(req.body.password, 10);
        }
        filesData.push(fileData);
      }
      const filesUploaded = await File.create(filesData);
      res.render("index", { fileLink: `${req.headers.origin}/file/${filesUploaded.map(f => f.id).join(',')}` });
    }
  } catch (err) {
    console.error("Error uploading files:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.route("/file/:id").get(handleDownload).post(handleDownload);

/* To handle download of the above single and multiple file upload logic */

async function handleDownload(req, res) {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      res.status(404).send(`File with ID ${req.params.id} not found`);
      return;
    }
    if (file.password != null) {
      if (!req.body.password) {
        res.render("password");
        return;
      }

      if (!(await bcrypt.compare(req.body.password, file.password))) {
        res.render("password", { error: true });
        return;
      }
    }
    file.downloadCount++;
    await file.save();
    console.log(file.downloadCount);

    res.download(file.path, file.originalName);
  } catch (err) {
    console.error("Error downloading file:", err);
    res.status(500).send("Internal Server Error");
  }
}



// async function handleDownload(req, res) {
//   try {
//     const fileIds = req.params.id.split(",");
//     const files = await File.find({ _id: { $in: fileIds } });

//     if (files.length === 0) {
//       res.status(404).send("No files found");
//       return;
//     }
//     if (files.length === 1) {
//       const file = files[0];

//       if (file.password != null) {
//         console.log("no password");
//       }

//       file.downloadCount++;
//       await file.save();
//       console.log(file.downloadCount);

//       return res.download(file.path, file.originalName);
//     }

//     const zipFilePath = "files.zip";
//     const output = fs.createWriteStream(zipFilePath);
//     const archive = archiver("zip");

//     output.on("close", function () {
//       console.log(archive.pointer() + " total bytes");
//       console.log("Done");

//       res.download(zipFilePath, "files.zip", function (err) {
//         if (err) {
//           console.error("Error sending ZIP file:", err);
//         }
//         fs.unlinkSync(zipFilePath);
//       });
//     });

//     archive.on("error", function (err) {
//       console.error("Error creating ZIP file:", err);
//       res.status(500).send("Internal Server Error");
//     });

//     archive.pipe(output);

//     for (const file of files) {
//       archive.file(file.path, { name: file.originalName });
//     }

//     archive.finalize();
//   } catch (err) {
//     console.error("Error downloading files:", err);
//     res.status(500).send("Internal Server Error");
//   }
// }
app.listen(process.env.PORT);
