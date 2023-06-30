---
title: deploy next app in eks
description: deploy next app in eks
author: haimtran
publishedDate: 06/29/2023
date: 2023-06-29
---

## Introduction

[GitHub](https://github.com/cdk-entest/eks-cdk-launch/tree/master/next-app) this note shows how to deploy a simple next.js app in eks

- nextjs and grid of books
- build docker image
- build yaml file

## Setup Project

Let create a new next.js project

```bash
npx create-next-app@latest
```

Project structure

```
|--app
  |--page.tsx
  |--layout.css
  |--global.css
  |--Dockerfile
  |--.dockerignore
  |--build.py
|--tailwind.config.js
|--next.config.js
|--package.json
```

## Dark Theme

Update the tailwind.config.js to enable dark theme

```js
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {},
      fontFamily: {
        mplus: ["'M PLUS Rounded 1c'", "Verdana", "sans-serif"],
      },
    },
  },
  plugins: [],
};
```

Add the mplus theme to global.css also

```css
@import url("https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@300;500;700&display=swap");
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Hero Section

Let create a nice hero section with image background or loop video (TODO)

```tsx
<div className="relative h-80 dark:bg-slate-800 flex items-center justify-center">
  <img
    src="/singapore.jpg"
    className="absolute w-full h-full object-cover opacity-30"
  ></img>
  <h1 className="dark:text-white font-mplus font-semibold text-3xl z-10">
    Web Development on AWS
  </h1>
</div>
```

and simple footer

```tsx
<footer className="dark:text-white dark:bg-slate-900 bg-gray-200 text-gray-00 py-4">
  <div className="mx-auto max-w-5xl text-center text-base">
    Copyright &copy; 2023 entest, Inc
  </div>
</footer>
```

## Tailwind Grid

Let create the home page with a grid of all books in two columns

```ts
<div
  className="
    mx-auto 
    max-w-5xl 
    dark:bg-slate-800 
    px-5 
    mt-5 
    mb-5"
>
  <div className="grid grid-cols-2 gap-5">
    {books.map((book) => {
      return (
        <div key={book.order}>
          <div
            className="
            ml-4 
            bg-white p-3 
            dark:bg-slate-900 
            dark:text-white"
          >
            <h4 className="font-bold mb-8">{book.title}</h4>
            <div>
              <img
                src={book.image}
                className="float-left h-auto w-64 mr-6"
                alt="book-image"
              />
            </div>
            <p className="text-sm">{book.description}</p>
            <a href="#" target="_blank">
              <button
                className="
                bg-orange-300 
                px-14 py-3 
                rounded-md 
                shadow-md 
                hover:bg-orange-400 
                mt-2"
              >
                Amazon
              </button>
            </a>
          </div>
        </div>
      );
    })}
  </div>
</div>
```

## Docker Image

Let build a docker image to deploy the next.js app. Here is the dockerfile

```
# layer 1
FROM node:lts as dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# layer 2
FROM node:lts as builder
WORKDIR /app
COPY . .
COPY --from=dependencies /app/node_modules ./node_modules
RUN npm run build

# layer 3
FROM node:lts as runner
WORKDIR /app
ENV NODE_ENV production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# run
EXPOSE 3000
CMD ["npm", "start"]
```

The .dockerignore file

```
node_modules
**/node_modules/
.next
.git
```

Let write a python script to automate build and push to aws ecr

```py
import os
import subprocess

# parameters
REGION = "ap-southeast-1"
ACCOUNT = "227135398356"

# delete all docker images
os.system("sudo docker system prune -a")

# build next-app image
os.system("sudo docker build -t next-app . ")

#  aws ecr login
os.system(f"aws ecr get-login-password --region {REGION} | sudo docker login --username AWS --password-stdin {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com")

# get image id
IMAGE_ID=os.popen("sudo docker images -q next-app:latest").read()

# tag next-app image
os.system(f"sudo docker tag {IMAGE_ID.strip()} {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/next-app:latest")

# create ecr repository
os.system(f"aws ecr create-repository --registry-id {ACCOUNT} --repository-name next-app")

# push image to ecr
os.system(f"sudo docker push {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/next-app:latest")

# run locally to test
os.system(f"sudo docker run -d -p 3000:3000 next-app:latest")
```

Run the container image locally to test it

```bash
sudo docker run -d -p 3000:3000 next-app:latest"
```

## Deploy in EKS

Let deploy the next.js app in EKS, here is the yaml file. Please replace the ecr image path

```yaml
apiVersion: v1
kind: Service
metadata:
  name: next-app-service
spec:
  ports:
    - port: 80
      targetPort: 3000
  selector:
    app: next-app
  type: LoadBalancer
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: next-app-deployment
spec:
  replicas: 2
  selector:
    matchLabels:
      app: next-app
  template:
    metadata:
      labels:
        app: next-app
    spec:
      containers:
        - image: 227135398356.dkr.ecr.ap-southeast-1.amazonaws.com/next-app:latest
          name: next-app
          ports:
            - containerPort: 3000
          resources:
            limits:
              cpu: 500m
            requests:
              cpu: 500m
---
apiVersion: autoscaling/v2beta2
kind: HorizontalPodAutoscaler
metadata:
  name: next-app-hpa
spec:
  maxReplicas: 1000
  metrics:
    - resource:
        name: cpu
        target:
          averageUtilization: 5
          type: Utilization
      type: Resource
  minReplicas: 2
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: next-app-deployment
```


## Troubleshooting 

Install docker for amazon linux 2023 

```bash 
sudo dnf install docker
sudo yum install -y docker
```

And start the docker 

```bash 
systemctl start docker
```

## Amazon Linux 2023 

List repositories 

```bash 
sudo yum repolist all 
```

Add a repository 

```bash 
sudo yum-config-manager --add-repo http:/www.example.com/example.repo 
```

Then enable a repository 

```bash 
sudo yum-config-manager --enable repository
```

The repository here is the repository ID from the command list repository 


## Reference 

- [Redhat Repository](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/deployment_guide/sec-managing_yum_repositories)

- [Amazon Linux 2023 Add Repository](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/add-repositories.html)

- [Amazon Linux 2023 Deterministic Upgrades](https://docs.aws.amazon.com/linux/al2023/ug/deterministic-upgrades.html)