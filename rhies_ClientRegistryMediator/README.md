## RHIES Client Registry mediator ##

### Prerequisites ###
* Netbeans or VS code or any editor you prefere

### How to modify the ClientRegistryMediator ###

Follow the steps to modify the ClientRegistryMediator mediator: 

1. Open the **server** folder inside your ide

2. Edit the **lib/index.js** file

3. Push your modifications to GitHub

4. Before building the image, delete the **node_modules** folder

5. Build the docker image by running the command  **docker build -t  savicsorg/omrstocr:latest .**  while in the docker folder, the **latest** flag is the version number

6. Push your image to the docker hub by running the command **docker push savicsorg/omrstocr:latest** ,the **latest** flag is the version number
