import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as dotenv from "dotenv";
import { Subnet } from "@pulumi/aws/ec2";

dotenv.config();

const vpc = new awsx.ec2.Vpc("slim-travel");

pulumi.all([vpc.subnets, vpc.privateSubnetIds]).apply(([subnets, privateSubnetIds]) => {
    const subnetsById:{ [key: string]: Subnet } = {};
    pulumi.all(subnets.map(subnet => subnet.id)).apply(subnetIds => {
        for (let i = 0; i < subnets.length; i++) {
            subnetsById[subnetIds[i]] = subnets[i];
        }
        const privateSubnets = privateSubnetIds.map(privateSubnetId => subnetsById[privateSubnetId]);
        pulumi.all(privateSubnets.map(privateSubnet => privateSubnet.availabilityZone)).apply(privateSubnetAvailabilityZones => {
            console.log(privateSubnetAvailabilityZones);
            console.log([...new Set(privateSubnetAvailabilityZones)]);
        });
    });
});

export = async () => {
    
}