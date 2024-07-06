import * as fs from "fs";
import * as crypto from "crypto";
import chalk from "chalk";

const logSuccess = (message: string) => console.log(chalk.green(message));
const logError = (message: string) => console.log(chalk.red(message));
const logInfo = (message: string, value: string) =>
  console.log(chalk.blue(message), chalk.yellow(value));
const logLine = () =>
  console.log(
    chalk.magenta(
      "\n------------------------------------\n"
    )
  );

const readFile = (filePath: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

const verifyEmailSignature = async () => {
  try {
    const email = "ksrinivasrao531@gmail.com";
    const publicKeyPath = "diffusion-pub.pem";
    const signaturePath = "email_signature.bin";

    logInfo("Email: ", email);
    logInfo("Public Key Path: ", publicKeyPath);
    logInfo("Signature Path: ", signaturePath);
    logLine();

    const publicKeyPem = await readFile(publicKeyPath);
    const signature = await readFile(signaturePath);

    const verify = crypto.createVerify("SHA256");
    verify.update(email);
    verify.end();

    const isValid = verify.verify(publicKeyPem.toString(), signature);

    if (isValid) {
      logSuccess("✅ Signature is valid.\n");
    } else {
      logError("❌ Signature is invalid.\n");
    }
  } catch (error) {
    console.error("Error verifying signature:", error);
  }
};

verifyEmailSignature();
