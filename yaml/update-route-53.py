"""
update route 53 record 
please change to entest aws account 
"""

import os 
import boto3

# change to entest account 
os.system("set-aws-account.sh entest ap-southeast-1")

# route53 client
client = boto3.client('route53')

# update load balancer dns 
response = client.change_resource_record_sets(
    ChangeBatch={
        'Changes': [
            {
                'Action': 'UPSERT',
                'ResourceRecordSet': {
                    'Name': 'nicv-image.entest.io',
                    'ResourceRecords': [
                        {
                            'Value': 'a24530a9831fa42379d2b88a9c1d272e-1667757562.ap-southeast-1.elb.amazonaws.com',
                        },
                    ],
                    'TTL': 300,
                    'Type': 'CNAME',
                },
            },
        ],
        'Comment': 'Web Server',
    },
    HostedZoneId='Z085201926Z176T5SURVO',
)

print(response)

# change back to demo account 
os.system("set-aws-account.sh demo us-east-1")