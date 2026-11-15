import json, subprocess, os
tag = open('.import-s1-tag.txt').read().strip()
image = f"511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-platformapi:{tag}"
env = {**os.environ, 'AWS_PROFILE': 'forge-dev', 'AWS_REGION': 'us-east-1'}
out = subprocess.check_output(['aws','ecs','describe-task-definition','--task-definition','forge-development-ecs-platform-api:29','--output','json'], env=env)
td = json.loads(out)['taskDefinition']
keys = ['family','taskRoleArn','executionRoleArn','networkMode','containerDefinitions','volumes','placementConstraints','requiresCompatibilities','cpu','memory','runtimePlatform','proxyConfiguration','inferenceAccelerators','ephemeralStorage','pidMode','ipcMode']
reg = {k: td[k] for k in keys if k in td and td[k] is not None}
for c in reg['containerDefinitions']:
    c['image'] = image
    print('container', c.get('name'), '->', image)
with open('.import-s1-td-register.json','w') as f:
    json.dump(reg, f, indent=2)
print('wrote register json')
