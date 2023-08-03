import * as pulumi from "@pulumi/pulumi";
import * as awsClassic from "@pulumi/aws";
import * as aws from "@pulumi/aws-native";
import * as awsx from "@pulumi/awsx";
import * as dotenv from "dotenv";

dotenv.config();

const vpcCidrBlock = "10.0.0.0/16";
const dbEngine = "aurora-postgresql";
const baseName = "slim-travel";

const availabilityZoneNames = ['eu-west-2a', 'eu-west-2b'];

const vpnEndpointLogGroupName = "vpn/endpoint";
const vpnEndpointLogStreamName = baseName;

export = async () => {
    const vpc = new awsx.ec2.Vpc(baseName, {
        availabilityZoneNames: availabilityZoneNames,
        cidrBlock: vpcCidrBlock,
        enableDnsSupport: true,
        enableDnsHostnames: true,
        natGateways: {
            strategy: "None"
        }
    });
    const subnetGroup = new aws.rds.DBSubnetGroup(baseName, {
        dBSubnetGroupName: baseName,
        dBSubnetGroupDescription: baseName,
        subnetIds: vpc.privateSubnetIds,
    });
    const cluster = new aws.rds.DBCluster(baseName, {
        availabilityZones: availabilityZoneNames,
        dBSubnetGroupName: baseName,
        port: 5432,
        backupRetentionPeriod: 35,
        dBClusterIdentifier: baseName,
        databaseName: "SlimTravel",
        engine: dbEngine,
        engineVersion: "15.2",
        masterUsername: <string>process.env.POSTGRESQL_USERNAME,
        masterUserPassword: <string>process.env.POSTGRESQL_PASSWORD,
        preferredBackupWindow: "07:00-09:00",
        serverlessV2ScalingConfiguration: {
            minCapacity: 0.5,
            maxCapacity: 10
        }
    }, {
        ignoreChanges: ["availabilityZones"],
        dependsOn: [ subnetGroup ]
    });
    for (let i = 0; i < availabilityZoneNames.length; i++) {
        new aws.rds.DBInstance(`${baseName}-${i + 1}`, {
            dBClusterIdentifier: cluster.id,
            engine: dbEngine,
            dBInstanceClass: "db.serverless",
            availabilityZone: availabilityZoneNames[i]
        });
    }
    const logGroup = new awsClassic.cloudwatch.LogGroup(vpnEndpointLogGroupName, {
        name: vpnEndpointLogGroupName
    });
    const logStream = new awsClassic.cloudwatch.LogStream(vpnEndpointLogStreamName, {
        name: vpnEndpointLogStreamName,
        logGroupName: logGroup.name
    });
    /*const clientVpnEndpoint = new awsClassic.ec2clientvpn.Endpoint(`${baseName}-clientvpn`, {
        vpcId: vpc.vpcId,
        serverCertificateArn: "arn:aws:acm:eu-west-2:486087129309:certificate/feb470b7-caa5-45a8-935f-146e7ef4eecd",
        clientCidrBlock: "10.1.0.0/16",
        authenticationOptions: [{
            type: "certificate-authentication",
            rootCertificateChainArn: "arn:aws:acm:eu-west-2:486087129309:certificate/fa995600-1a33-4fa4-b9da-c3124f440431",
        }],
        connectionLogOptions: {
            enabled: true,
            cloudwatchLogGroup: logGroup.name,
            cloudwatchLogStream: logStream.name
        },
        clientConnectOptions: {
            enabled: false
        },
        splitTunnel: true
    });
    vpc.privateSubnetIds.apply(privateSubnetIds => {
        for (let i = 0; i < privateSubnetIds.length; i++) {
            new awsClassic.ec2clientvpn.NetworkAssociation(`${baseName}-${i+1}`, {
                clientVpnEndpointId: clientVpnEndpoint.id,
                subnetId: privateSubnetIds[i],
            });
        }
    });
    new awsClassic.ec2clientvpn.AuthorizationRule(baseName, {
        clientVpnEndpointId: clientVpnEndpoint.id,
        targetNetworkCidr: vpcCidrBlock,
        authorizeAllGroups: true
    });
    pulumi.all([vpc.subnets, vpc.privateSubnetIds]).apply(([subnets, privateSubnetIds]) => {
        const subnetsById:{ [key: string]: awsClassic.ec2.Subnet } = {};
        pulumi.all(subnets.map(subnet => subnet.id)).apply(subnetIds => {
            for (let i = 0; i < subnets.length; i++) {
                subnetsById[subnetIds[i]] = subnets[i];
            }
            const privateSubnets = privateSubnetIds.map(privateSubnetId => subnetsById[privateSubnetId]);
            pulumi.all(privateSubnets.map(privateSubnet => privateSubnet.cidrBlock)).apply(privateSubnetCidrBlocks => {
                for (let i = 0; i < privateSubnetCidrBlocks.length; i++) {
                    new awsClassic.ec2clientvpn.Route(`${baseName}-${i + 1}`, {
                        clientVpnEndpointId: clientVpnEndpoint.id,
                        destinationCidrBlock: "0.0.0.0/0",
                        targetVpcSubnetId: privateSubnets[i].id,
                    });
                }
            });
        });
    });*/
}