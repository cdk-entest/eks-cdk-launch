import os 

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