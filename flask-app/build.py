import os 
import subprocess

# parameters
REGION = "ap-southeast-1"
ACCOUNT = "394599967678"

# delete all docker images 
os.system("sudo docker system prune -a") 

# build flask-app image 
os.system("sudo docker build -t flask-app . ")

#  aws ecr login 
os.system(f"aws ecr get-login-password --region {REGION} | sudo docker login --username AWS --password-stdin {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com")

# get image id 
IMAGE_ID=os.popen("sudo docker images -q flask-app:latest").read()

# tag flask-app image 
os.system(f"sudo docker tag {IMAGE_ID.strip()} {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/flask-app:latest")

# create ecr repository 
# os.system(f"aws ecr create-repository --registry-id {ACCOUNT} --repository-name flask-app")

# push image to ecr 
os.system(f"sudo docker push {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/flask-app:latest")
