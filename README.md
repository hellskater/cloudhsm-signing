# ColoudHSM private key signing

This repo consists of the node.js script that can be used to verify whether the `public_key` and the `signature` is valid on not for the message payload of `ksrinivasrao531@gmail.com` which is signed with a CloudHSM private key inside an EC2 instance, since AWS does not let us export `private_key`s from CloudHSM.

## Local setup and script running

> [!NOTE]  
> Make sure you have `Node` runtime installed in your local before proceeding.

1. Clone the repo and `cd` inside it.
2. Run the following commands
   ```bash
   npm install
   npm run verify
   ```
3. You should see something like this in your terminal, which means the signature and the public_key is valid.
   
   ![Screenshot 2024-07-06 at 1 54 04 PM](https://github.com/hellskater/cloudhsm-signing/assets/47584722/6ec7261e-db58-4488-af88-b0ccf300cd45)
5. If you go inside `verify.ts` and change the value of `email` variable to something else for example `wrong_email@gmail.com`, and run `npm run verify` again, you should see the below output in your terminal.
  
   ![Screenshot 2024-07-06 at 1 53 50 PM](https://github.com/hellskater/cloudhsm-signing/assets/47584722/a835fd7d-2201-4811-a571-b016e5030e67)

## Steps taken to sign the message using a CloudHSM private key

- Create an AWS account if you don't have one already, sign in with the root user -> Go to `IAM` console -> Create a usergroup called `admin` -> Assign the `AdministratorAccess` permission to the group -> Create a user with any name like `srini` -> Add `srini` to the `admin` user group.
- Sign in with the IAM user `srini` account
- Go to VPC console -> `Create VPC` -> Name it something like `CloudHSM` and create it with the default values.
- Go to CloudHSM console -> `Create cluster` -> Select your created VPC -> Choose your private availability zone for each option (you can check it in VPC console) -> Select `hsm1.medium` in HSM type -> Create the cluster with the default values next
- Go to EC2 console -> `Launch instance` -> Name it `cloudhsm` or something else -> Select `Amazon linux 2023` OS Image -> Leave the default `Instance type` -> In the keypair section, create a keypair with `.pem` format and save it somewhere safe -> In the Network settings, slect your previously created VPC, select a public subnet that was create for the VPC -> Enable Auto-assign Public IP -> Select an existing security group, select both the `deafult` and `cloudhsm-<>` groups-> Leave rest of the defaults and launch instance
- Go to EC2 console -> Select your running instance -> In the `Security` tab select security group `default` -> `Actions` -> `Edit inbount rules` -> `Add Rule` -> Choose `SSH` and in the source `My IP` -> Save
- Go to CloudHSM console -> Select your running cluster -> `Actions` -> `Initialize` -> Choose availability zone and create -> It will take some time, in the next step, download all the certificates on your screen
 ![image](https://github.com/hellskater/cloudhsm-signing/assets/47584722/0109ab96-130b-41f1-a641-6946b8c3b01d)
- Follow the steps from [here](https://docs.aws.amazon.com/cloudhsm/latest/userguide/initialize-cluster.html) to sign your certificate and upload it to initialise the cluster.
- Now you need to SSH into your previously created EC2 instance follow these steps to do it

> [!NOTE]  
> You can find the PUBLIC IPV4 DNS of your EC2 instance by going to EC2 console and clicking on your running instance
> ![image](https://github.com/hellskater/cloudhsm-signing/assets/47584722/d2bc7dfe-2c2b-4fc1-a986-f89e6aa00876)

  ```bash
  chmod 400 <PATH_TO_YOUR_DOWNLOADED_PRIVATE_KEY>
  ssh -i "<PATH_TO_YOUR_DOWNLOADED_PRIVATE_KEY>" ec2-user@<EC2_INSTANCE_PUBLIC IPV4 DNS>
  ```
- After you're successfully logged into your EC2 instance run these commands to download, install and run `cloudhsm-cli` SDK-5 suite

> [!NOTE]  
> You can find the ENI IP address of your HSM in CloudHSM console after clicking on your running cluster
> ![image](https://github.com/hellskater/cloudhsm-signing/assets/47584722/34f09efc-1bba-4e6d-9b74-4e99d8e91752)

  
  ```bash
  wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Amzn2023/cloudhsm-cli-latest.amzn2023.x86_64.rpm
  sudo yum install ./cloudhsm-cli-latest.amzn2023.x86_64.rpm
  sudo /opt/cloudhsm/bin/configure-cli -a <The ENI IP addresses of the HSMs>
  ```
- In order to activate your CloudHSM cluster we need to move our previously created `customerCA.crt` in our into our EC2 instance, to do that, follow the below commands after exiting out of your SSH session
  ```bash
  scp -i "<PATH_TO_YOUR_DOWNLOADED_PRIVATE_KEY>" <PATH_TO_customCA.crt> ec2-user@<EC2_INSTANCE_PUBLIC IPV4 DNS>:/home/ec2-user/customerCA.crt
  ssh -i "<PATH_TO_YOUR_DOWNLOADED_PRIVATE_KEY>" ec2-user@<EC2_INSTANCE_PUBLIC IPV4 DNS>
  sudo mv customerCA.crt /opt/cloudhsm/etc/customerCA.crt
  ```
- To activate the cluster run the below commands

> [!NOTE]  
> Note down the admin password somewhere safe in the next step

  ```bash
  /opt/cloudhsm/bin/cloudhsm-cli interactive
  cluster activate
  ```
- Next we will generate our keys using CloudHSM, follow the below commands after SSHing into your EC2 instance

> [!NOTE]  
> In the next-step we are disabling key check so that we don't have to create and configure another HSM to create our keys

  ```bash
  sudo /opt/cloudhsm/bin/configure-cli --disable-key-availability-check
  /opt/cloudhsm/bin/cloudhsm-cli interactive
  login --username admin --role admin
  user create --username cryptouser --role crypto-user --password password
  logout
  login --username cryptouser --role crypto-user --password password
  key generate-asymmetric-pair ec --curve secp256k1 --public-label pub-example --private-label priv-example --private-attributes sign=true
  key generate-file --encoding reference-pem --path /home/ec2-user/private-key.pem --filter attr.label="priv-example"
  key generate-file --encoding pem --path /home/ec2-user/public-key.pem --filter attr.label="pub-example"
  quit
  ```
> [!IMPORTANT]  
> - We need to create a user with role `crypto-user` to be able to create keys.
> - When we run the `key generate-file` command to export our private key, it only exports the reference to the actual private key, we cannot use the reference private key outside of cloudhsm context without a valid client.

- In the next step we need to install an CloudHSM compatible client in order to use the private key to sign our message, in our case we will go with `OpenSSL Dynamic Engine`, follow the below commands to install it
  ```bash
  wget https://s3.amazonaws.com/cloudhsmv2-software/CloudHsmClient/Amzn2023/cloudhsm-dyn-latest.amzn2023.x86_64.rpm
  sudo yum install ./cloudhsm-dyn-latest.amzn2023.x86_64.rpm
  sudo /opt/cloudhsm/bin/configure-dyn -a <The ENI IP addresses of the HSMs>
  sudo /opt/cloudhsm/bin/configure-dyn --disable-key-availability-check
  export CLOUDHSM_PIN=cryptouser:password
  openssl engine -t cloudhsm
  ```
- Now that we have successfully installed `OpenSSL dynamic engine` and integrated with `CloudSHM` engine, we can go ahead and sign our message with the reference private key that we generated earlier
  ```bash
  echo -n "ksrinivasrao531@gmail.com" | openssl dgst -sha256 -sign private-key.pem -engine cloudhsm -out email_signature.bin
  ```
- We should now have a file generated called `email_signature.bin`, we can go ahead and verify it with the public key
  ```bash
  echo -n "ksrinivasrao531@gmail.com" | openssl dgst -sha256 -verify public-key.pem -signature email_signature.bin
  ```
- Next if we want we can export the public key to our local using `SCP`
