import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as dotenv from "dotenv";
import { Subnet } from "@pulumi/aws/ec2";

dotenv.config();

const vpcCidrBlock = "10.0.0.0/16";
const dbEngine = "aurora-postgresql";

const availabilityZoneNames = ['eu-west-2a', 'eu-west-2b'];

const vpnEndpointLogGroupName = "vpn/endpoint";
const vpnEndpointLogStreamName = "slim-travel";

export = async () => {
    const vpc = new awsx.ec2.Vpc("slim-travel", {
        availabilityZoneNames: availabilityZoneNames,
        cidrBlock: vpcCidrBlock,
        enableDnsSupport: true,
        enableDnsHostnames: true
    });
    const dbSubnetGroup = new aws.rds.SubnetGroup("dbsubnet", {
        name: "slim-travel",
        subnetIds: vpc.privateSubnetIds,
    });
    const cluster = new aws.rds.Cluster("slim-travel", {
        availabilityZones: availabilityZoneNames,
        dbSubnetGroupName: dbSubnetGroup.name,
        backupRetentionPeriod: 35,
        clusterIdentifier: "slim-travel",
        databaseName: "SlimTravel",
        engine: dbEngine,
        engineVersion: "15.2",
        masterUsername: <string>process.env.POSTGRESQL_USERNAME,
        masterPassword: <string>process.env.POSTGRESQL_PASSWORD,
        preferredBackupWindow: "07:00-09:00",
        skipFinalSnapshot: true
    }, {
        ignoreChanges: ["availabilityZones"]
    });
    for (let i = 0; i < availabilityZoneNames.length; i++) {
        new aws.rds.ClusterInstance(`slim-travel-${i + 1}`, {
            clusterIdentifier: cluster.id,
            engine: dbEngine,
            instanceClass: aws.rds.InstanceType.T3_Medium,
            availabilityZone: availabilityZoneNames[i]
        });
    }
    const logGroup = new aws.cloudwatch.LogGroup(vpnEndpointLogGroupName, {
        name: vpnEndpointLogGroupName
    });
    const logStream = new aws.cloudwatch.LogStream(vpnEndpointLogStreamName, {
        name: vpnEndpointLogStreamName,
        logGroupName: logGroup.name
    });
    const clientVpnEndpoint = new aws.ec2clientvpn.Endpoint("slim-travel-clientvpn", {
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
            new aws.ec2clientvpn.NetworkAssociation(`slim-travel-${i+1}`, {
                clientVpnEndpointId: clientVpnEndpoint.id,
                subnetId: privateSubnetIds[i],
            });
        }
    });
    new aws.ec2clientvpn.AuthorizationRule("slim-travel", {
        clientVpnEndpointId: clientVpnEndpoint.id,
        targetNetworkCidr: vpcCidrBlock,
        authorizeAllGroups: true
    });
    pulumi.all([vpc.subnets, vpc.privateSubnetIds]).apply(([subnets, privateSubnetIds]) => {
        const subnetsById:{ [key: string]: Subnet } = {};
        pulumi.all(subnets.map(subnet => subnet.id)).apply(subnetIds => {
            for (let i = 0; i < subnets.length; i++) {
                subnetsById[subnetIds[i]] = subnets[i];
            }
            const privateSubnets = privateSubnetIds.map(privateSubnetId => subnetsById[privateSubnetId]);
            pulumi.all(privateSubnets.map(privateSubnet => privateSubnet.cidrBlock)).apply(privateSubnetCidrBlocks => {
                for (let i = 0; i < privateSubnetCidrBlocks.length; i++) {
                    new aws.ec2clientvpn.Route(`slim-travel-${i + 1}`, {
                        clientVpnEndpointId: clientVpnEndpoint.id,
                        destinationCidrBlock: "0.0.0.0/0",
                        targetVpcSubnetId: privateSubnets[i].id,
                    });
                }
            });
        });
    });
}