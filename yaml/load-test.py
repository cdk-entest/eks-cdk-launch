import time
import requests
from concurrent.futures import ThreadPoolExecutor

URL = "http://a0f0274869c784e28935453584f49be2-524602303.ap-southeast-1.elb.amazonaws.com"
NO_CONCUR_REQUEST = 1000
COUNT = 1


def send_request():
    resp = requests.get(URL)
    # print(resp)


def test_concurrent():
    with ThreadPoolExecutor(max_workers=NO_CONCUR_REQUEST) as executor:
        for k in range(1, NO_CONCUR_REQUEST):
            executor.submit(send_request)


while True:
    print(f"{NO_CONCUR_REQUEST} requests {COUNT}")
    test_concurrent()
    time.sleep(1)
    COUNT += 1
